import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import AppLayout from '../components/AppLayout'
import { Icon, Spinner } from '../components/DesignSystem'
import { CAT_COLORS } from '../components/Charts'
import DueAlertBanner from '../components/DueAlertBanner'
import DuePaymentsPanel, { defaultDueDate, DueStatusBadge } from '../components/DuePaymentsPanel'
import { useAuth } from '../contexts/AuthContext'
import { exportToExcel } from '../lib/exportExcel'
import { ReceiptModal, fmtDateTime } from '../components/Receipt'
import Quotations from './Quotations'
import ReturnReplace from './ReturnReplace'
import OrgSettings from './OrgSettings'
import Suppliers from './Suppliers'
import { OverviewView, IncomingShipmentsView, StaffView, MyProductsView, ActivityView, MainCompanyAccountView } from './DistributorAdminViews'

// Shown to everyone (main-branch cashier or distributor staff) — the core POS job.
const BASE_NAV = [
  { id: 'pos',       label: 'Point of Sale',    sub: 'Create invoices',      icon: 'zap'      },
  { id: 'quotes',    label: 'Quotations',        sub: 'Estimates & proposals',icon: 'doc'      },
  { id: 'returns',   label: 'Return / Replace',  sub: 'Process with receipt', icon: 'arrow-up' },
  { id: 'dues',      label: 'Due Payments',      sub: 'Outstanding balances', icon: 'card'     },
  { id: 'inventory', label: 'Inventory',         sub: 'Current stock levels', icon: 'box'      },
  { id: 'ledger',    label: 'Sales History',     sub: 'Branch invoices',      icon: 'list'     },
]

// Only for distributor_user — a distributor branch has no admin/cashier split,
// so every account there gets these branch-management extras too.
const DISTRIBUTOR_NAV = [
  { id: 'overview',  label: 'Overview',         sub: 'Branch performance',         icon: 'home'     },
  { id: 'activity',  label: 'Recent Activity',  sub: 'Everything that happened',   icon: 'lightning'},
  { id: 'shipments', label: 'Incoming Stock',   sub: 'Confirm received shipments', icon: 'download' },
  { id: 'account',   label: 'Main Company Account', sub: 'What you owe & payment history', icon: 'cash' },
  { id: 'myproducts',label: 'My Products',      sub: 'Your own items & pricing',   icon: 'grid'     },
  { id: 'suppliers', label: 'Suppliers',        sub: 'Bills & amounts owed',       icon: 'cart'     },
  { id: 'staff',     label: 'Staff',            sub: 'Branch team',                icon: 'users'    },
  { id: 'settings',  label: 'Receipt Settings', sub: 'Business info on bills',     icon: 'edit'     },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rs(n) {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0)
  if (isNaN(num)) return 'Rs 0'
  return `Rs ${Math.round(num).toLocaleString('en-PK')}`
}

function unitPrice(prod, saleType) {
  if (saleType === 'wholesale') {
    return Math.round((prod.cost_price || prod.retail_price * 0.85) * 1.12)
  }
  return prod.retail_price
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CatChip({ cat, small }) {
  return (
    <span className={`inline-flex items-center rounded-full font-bold uppercase tracking-wide ${small ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[10px]'}`}
      style={{ background: (CAT_COLORS[cat] || '#6B7280') + '22', color: CAT_COLORS[cat] || '#6B7280' }}>
      {cat}
    </span>
  )
}

function StockPill({ qty }) {
  const color = qty === 0 ? 'var(--bad-text)' : qty <= 5 ? 'var(--warn-text)' : 'var(--ok-text)'
  const bg    = qty === 0 ? 'var(--bad-soft)'  : qty <= 5 ? 'var(--warn-soft)'  : 'var(--ok-soft)'
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-bold mono"
      style={{ background: bg, color }}>
      {qty === 0 ? 'Out of stock' : `${qty} in stock`}
    </span>
  )
}

// ─── POS View ─────────────────────────────────────────────────────────────────

function POSView({ products, orgId = '', currentUser, prefill, onPrefillUsed }) {
  const [search, setSearch]         = useState('')
  const [catFilter, setCatFilter]   = useState('All')
  const [cart, setCart]             = useState([])
  const [customer, setCustomer]     = useState({ name: '', phone: '', address: '' })
  const [saleType, setSaleType]     = useState('retail')
  const [discountPct, setDiscountPct] = useState(0)
  const [payMode, setPayMode]       = useState('now') // 'now' | 'credit'
  const [amountReceived, setAmountReceived] = useState('')
  const [dueDate, setDueDate]       = useState(defaultDueDate(30))
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [checking, setChecking]     = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [receipt, setReceipt]       = useState(null)
  const [receiptItems, setReceiptItems] = useState([])
  const [orgSettings, setOrgSettings]   = useState({})

  // Load org settings for receipt header
  useEffect(() => {
    if (!orgId) return
    window.api.orgSettingsGet(orgId)
      .then(res => { if (res.success) setOrgSettings(res.data) })
      .catch(() => {})
  }, [orgId])

  const cats = ['All', ...Array.from(new Set(products.map(p => p.category))).sort()]

  const visible = products.filter(p => {
    const q = search.toLowerCase()
    return (catFilter === 'All' || p.category === catFilter) &&
      (!q || p.name?.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
  })

  function addToCart(prod) {
    if (prod.qty_on_hand <= 0) return
    setCart(prev => {
      const ex = prev.find(c => c.id === prod.id)
      if (ex) {
        if (ex.qty >= prod.qty_on_hand) return prev
        return prev.map(c => c.id === prod.id ? { ...c, qty: c.qty + 1 } : c)
      }
      return [...prev, { ...prod, qty: 1 }]
    })
  }

  function adjustQty(id, delta) {
    setCart(prev =>
      prev.map(c => c.id === id ? { ...c, qty: Math.max(1, Math.min(c.qty + delta, c.qty_on_hand)) } : c)
        .filter(c => c.qty > 0)
    )
  }

  function removeItem(id) {
    setCart(prev => prev.filter(c => c.id !== id))
  }

  const cartTotal = cart.reduce((s, c) => s + unitPrice(c, saleType) * c.qty, 0)
  const discAmt   = Math.round(cartTotal * (parseFloat(discountPct) || 0) / 100)
  const afterDisc = cartTotal - discAmt
  const received  = parseFloat(amountReceived) || 0
  const balance   = Math.max(0, afterDisc - received)
  const needsDueDate = balance > 0.01
  const canCheckout = cart.length > 0 && customer.name.trim() && (!needsDueDate || dueDate)

  useEffect(() => {
    if (payMode === 'now') setAmountReceived(afterDisc ? String(Math.round(afterDisc)) : '')
  }, [afterDisc, payMode])

  // Apply prefill from a converted quotation
  useEffect(() => {
    if (!prefill || !products.length) return
    // Build cart from quote items, matching product ids
    const priceMap = {}
    for (const p of products) priceMap[p.id] = p

    const newCart = []
    for (const it of (prefill.items || [])) {
      const prod = priceMap[it.product_id]
      if (!prod) continue
      newCart.push({ ...prod, qty: it.quantity })
    }

    if (newCart.length > 0) {
      setCart(newCart)
      if (prefill.customer_name) setCustomer({ name: prefill.customer_name, phone: prefill.customer_phone || '', address: prefill.customer_address || '' })
      // Apply quote-level discount if any
      if (prefill.discount_amount > 0 && prefill.final_amount > 0) {
        const total = newCart.reduce((s, c) => s + (c.retail_price * c.qty), 0)
        if (total > 0) {
          const discPct = Math.round(prefill.discount_amount / total * 100)
          if (discPct > 0) setDiscountPct(discPct)
        }
      }
    }
    onPrefillUsed?.()
  }, [prefill])

  async function handleCheckout() {
    if (!canCheckout) return
    if (received > cartTotal + 0.01) {
      setCheckoutError('Amount received cannot exceed total')
      return
    }
    if (balance > 0.01 && !dueDate) {
      setCheckoutError('Due date is required for credit sales')
      return
    }

    setChecking(true)
    setCheckoutError('')
    try {
      const items = cart.map(c => ({
        product_id: c.id,
        quantity: c.qty,
        unit_price: unitPrice(c, saleType),
        line_total: unitPrice(c, saleType) * c.qty,
        warranty_months: c.warranty_months || 0,
      }))

      const res = await window.api.salesCreate({
        org_id: orgId,
        customer_name: customer.name.trim(),
        customer_phone: customer.phone,
        customer_address: customer.address,
        sale_type: saleType,
        total_amount: cartTotal,
        discount_amount: discAmt,
        final_amount: afterDisc,
        amount_paid: received,
        due_date: balance > 0.01 ? dueDate : null,
        payment_method: paymentMethod,
        created_by: currentUser?.name || currentUser?.email || '',
        items,
      })

      if (!res?.success) throw new Error(res?.error || 'Checkout failed')

      setReceipt({
        invoice_number: res.invoice_number,
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_address: customer.address,
        payment_method: paymentMethod,
        created_by: currentUser?.name || currentUser?.email || '',
        sale_type: saleType,
        total_amount: cartTotal,
        discount_amount: discAmt,
        final_amount: afterDisc,
        amount_paid: received,
        balance,
        due_date: balance > 0.01 ? dueDate : null,
        payment_status: res.payment_status,
        created_at: new Date().toISOString(),
      })
      setReceiptItems(items)
      setCart([])
      setCustomer({ name: '', phone: '', address: '' })
      setPayMode('now')
      setAmountReceived('')
      setDiscountPct(0)
      setDueDate(defaultDueDate(30))
    } catch (e) {
      setCheckoutError(e.message || 'Checkout failed')
      console.error('[POS] Checkout failed', e)
    }
    setChecking(false)
  }

  const INP = {
    width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '9px 12px', fontSize: 13, color: 'var(--text)',
    outline: 'none', transition: 'border-color .15s', fontFamily: 'var(--font-ui)',
  }

  return (
    <>
      {receipt && (
        <ReceiptModal invoice={receipt} items={receiptItems} products={products}
          orgSettings={orgSettings}
          onClose={() => { setReceipt(null); setReceiptItems([]) }} />
      )}

      {/* Two-column layout — all inline styles to guarantee flex works */}
      <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 106px)', overflow: 'hidden' }}>

        {/* ── Left: product catalog ─────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, overflow: 'hidden' }}>

          {/* Search + filter card */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0, boxShadow: 'var(--shadow-sm)' }}>
            {/* Search input */}
            <div style={{ position: 'relative' }}>
              <Icon name="search" size={14} sw={2} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
              <input
                style={{ ...INP, paddingLeft: 34, background: 'var(--surface-2)' }}
                placeholder="Search by name, brand, or SKU…"
                value={search} onChange={e => setSearch(e.target.value)}
              />
            </div>
            {/* Category pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {cats.map(c => {
                const color = c === 'All' ? '#0D9488' : (CAT_COLORS[c] || '#0D9488')
                const active = catFilter === c
                return (
                  <button key={c} onClick={() => setCatFilter(c)} style={{
                    padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                    background: active ? color : 'var(--surface-2)',
                    color: active ? '#fff' : 'var(--text-dim)',
                    border: `1.5px solid ${active ? color : 'var(--border)'}`,
                    cursor: 'pointer', transition: 'all .12s', fontFamily: 'var(--font-ui)',
                  }}>{c}</button>
                )
              })}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)' }}>{visible.length} items</span>
            </div>
          </div>

          {/* Product grid — 3 columns, scrollable */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: 'min-content', gap: 10, overflowY: 'auto', paddingBottom: 8, flex: 1, alignContent: 'start' }}>
            {visible.map(p => {
              const inCart = cart.find(c => c.id === p.id)
              const outOfStock = p.qty_on_hand <= 0
              const catColor = CAT_COLORS[p.category] || '#6B7280'
              return (
                <button key={p.id} onClick={() => addToCart(p)} disabled={outOfStock}
                  style={{
                    textAlign: 'left', borderRadius: 12, border: `1.5px solid ${inCart ? 'var(--accent)' : 'var(--border)'}`,
                    background: inCart ? 'var(--accent-soft)' : 'var(--surface)',
                    opacity: outOfStock ? 0.5 : 1, cursor: outOfStock ? 'not-allowed' : 'pointer',
                    boxShadow: inCart ? '0 0 0 2px rgba(13,148,136,0.3), 0 4px 12px rgba(13,148,136,0.12)' : 'var(--shadow-sm)',
                    transition: 'all .15s', overflow: 'hidden', display: 'block', padding: 0,
                  }}>
                  {/* Category colour bar */}
                  <div style={{ height: 3, background: catColor }} />
                  {/* Product image */}
                  <div style={{ height: 72, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {p.image_path ? (
                      <img src={p.image_path} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={e => { e.target.style.display = 'none' }} />
                    ) : (
                      <Icon name="box" size={22} sw={1.5} style={{ color: 'var(--text-faint)' }} />
                    )}
                  </div>
                  <div style={{ padding: '11px 13px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <CatChip cat={p.category} small />
                      {inCart && (
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: 'var(--accent)', color: '#fff', fontFamily: 'var(--font-mono)' }}>×{inCart.qty}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.35, marginBottom: 2, minHeight: 34 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 10, minHeight: 14 }}>{p.brand || ' '}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 14, color: catColor }}>{rs(unitPrice(p, saleType))}</span>
                      {!outOfStock ? <StockPill qty={p.qty_on_hand} /> : <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--bad-text)' }}>Out of stock</span>}
                    </div>
                  </div>
                </button>
              )
            })}
            {!visible.length && (
              <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 0', gap: 12, color: 'var(--text-faint)' }}>
                <Icon name="box" size={32} sw={1.5} />
                <span style={{ fontSize: 13 }}>No products found</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: cart sidebar ───────────────────────────────────────────── */}
        <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>

          {/* Cart header — fixed */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="zap" size={14} sw={2} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Cart</span>
              {cart.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 99, background: 'var(--accent)', color: '#fff' }}>{cart.length}</span>
              )}
            </div>
            {cart.length > 0 && (
              <button onClick={() => setCart([])} style={{ fontSize: 11, fontWeight: 600, color: 'var(--bad-text)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>Clear all</button>
            )}
          </div>

          {/* Everything below scrolls as one unit, so the checkout form and the
              Complete Sale button are never clipped off — only the cart-item count
              caps how tall the item list gets before the form starts. */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {/* Cart items */}
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
              {!cart.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: 12, color: 'var(--text-faint)' }}>
                  <Icon name="box" size={28} sw={1.5} />
                  <span style={{ fontSize: 12.5, textAlign: 'center', lineHeight: 1.5 }}>Tap a product to add it to the cart</span>
                </div>
              ) : (
                cart.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-text)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{rs(unitPrice(item, saleType))}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <button onClick={() => adjustQty(item.id, -1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                      <span style={{ width: 24, textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{item.qty}</span>
                      <button onClick={() => adjustQty(item.id, +1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      <button onClick={() => removeItem(item.id)} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'var(--bad-soft)', color: 'var(--bad-text)', cursor: 'pointer', marginLeft: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="x" size={10} sw={2.5} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Checkout form */}
            <div style={{ borderTop: '1px solid var(--border)', padding: '16px', display: 'flex', flexDirection: 'column', gap: 18, flexShrink: 0, background: 'var(--surface)' }}>

              {/* ── Pricing ─────────────────────────────────────────────────── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Pricing</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['retail', 'wholesale'].map(t => (
                    <button key={t} onClick={() => setSaleType(t)} style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      textTransform: 'capitalize', cursor: 'pointer', fontFamily: 'var(--font-ui)',
                      background: saleType === t ? 'var(--accent)' : 'var(--surface-2)',
                      color: saleType === t ? '#fff' : 'var(--text-dim)',
                      border: `1px solid ${saleType === t ? 'var(--accent)' : 'var(--border)'}`,
                      transition: 'all .12s',
                    }}>{t}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', flexShrink: 0 }}>Discount</label>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      style={{ ...INP, background: 'var(--surface-2)', fontSize: 12, fontFamily: 'var(--font-mono)', paddingRight: 26 }}
                      type="number" min="0" max="100" placeholder="0"
                      value={discountPct} onChange={e => setDiscountPct(e.target.value)}
                    />
                    <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-faint)', pointerEvents: 'none' }}>%</span>
                  </div>
                  {discAmt > 0 && (
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--warn-text)', fontWeight: 700, flexShrink: 0 }}>-{rs(discAmt)}</span>
                  )}
                </div>
              </div>

              {/* ── Customer ────────────────────────────────────────────────── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Customer</div>
                <input style={{ ...INP, background: 'var(--surface-2)', fontSize: 12.5 }}
                  placeholder="Customer name *" value={customer.name}
                  onChange={e => setCustomer(p => ({ ...p, name: e.target.value }))} />
                <input style={{ ...INP, background: 'var(--surface-2)', fontSize: 12.5, fontFamily: 'var(--font-mono)' }}
                  placeholder="Phone (optional)" value={customer.phone}
                  onChange={e => setCustomer(p => ({ ...p, phone: e.target.value }))} />
              </div>

              {/* ── Payment ─────────────────────────────────────────────────── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Payment</div>

                <div style={{ display: 'flex', gap: 6 }}>
                  {[{ id: 'now', label: 'Pay Now' }, { id: 'credit', label: 'Pay Later' }].map(m => (
                    <button key={m.id} type="button" onClick={() => setPayMode(m.id)} style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'var(--font-ui)',
                      background: payMode === m.id ? 'var(--accent)' : 'var(--surface-2)',
                      color: payMode === m.id ? '#fff' : 'var(--text-dim)',
                      border: `1px solid ${payMode === m.id ? 'var(--accent)' : 'var(--border)'}`,
                    }}>{m.label}</button>
                  ))}
                </div>

                {payMode === 'credit' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Due Date *</label>
                      <input style={{ ...INP, background: 'var(--surface-2)', fontSize: 12, marginTop: 4 }} type="date"
                        value={dueDate} min={new Date().toISOString().slice(0, 10)}
                        onChange={e => setDueDate(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Received Now</label>
                      <input style={{ ...INP, background: 'var(--surface-2)', fontSize: 12, fontFamily: 'var(--font-mono)', marginTop: 4 }}
                        type="number" min="0" placeholder="0"
                        value={amountReceived} onChange={e => setAmountReceived(e.target.value)} />
                    </div>
                  </div>
                )}

                {payMode === 'now' && (
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Amount Received</label>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <input style={{ ...INP, background: 'var(--surface-2)', fontSize: 12, fontFamily: 'var(--font-mono)', flex: 1 }}
                        type="number" min="0" value={amountReceived}
                        onChange={e => setAmountReceived(e.target.value)} />
                      <button type="button" onClick={() => setAmountReceived(String(Math.round(cartTotal)))}
                        style={{ padding: '0 12px', borderRadius: 8, fontSize: 10.5, fontWeight: 700, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-dim)', cursor: 'pointer' }}>
                        Full
                      </button>
                    </div>
                  </div>
                )}

                {needsDueDate && payMode === 'now' && (
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--warn-text)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Balance Due Date *</label>
                    <input style={{ ...INP, background: 'var(--surface-2)', fontSize: 12, marginTop: 4 }} type="date"
                      value={dueDate} min={new Date().toISOString().slice(0, 10)}
                      onChange={e => setDueDate(e.target.value)} />
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6 }}>
                  {['cash', 'bank'].map(m => (
                    <button key={m} type="button" onClick={() => setPaymentMethod(m)} style={{
                      flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11, fontWeight: 600,
                      textTransform: 'capitalize', cursor: 'pointer', fontFamily: 'var(--font-ui)',
                      background: paymentMethod === m ? 'var(--accent)' : 'var(--surface-2)',
                      color: paymentMethod === m ? '#fff' : 'var(--text-dim)',
                      border: `1px solid ${paymentMethod === m ? 'var(--accent)' : 'var(--border)'}`,
                    }}>{m === 'bank' ? 'Bank' : 'Cash'}</button>
                  ))}
                </div>
              </div>

              {/* ── Total ───────────────────────────────────────────────────── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '12px 0 0', borderTop: '1px solid var(--border)' }}>
                {discAmt > 0 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Subtotal</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)', textDecoration: 'line-through' }}>{rs(cartTotal)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: 'var(--warn-text)', fontWeight: 600 }}>Discount ({discountPct}%)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--warn-text)', fontWeight: 700 }}>-{rs(discAmt)}</span>
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' }}>Total</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 22, color: 'var(--accent-text)' }}>{rs(afterDisc)}</span>
                </div>
                {balance > 0.01 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--bad-text)' }}>Balance Due</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: 'var(--bad-text)' }}>{rs(balance)}</span>
                  </div>
                )}
              </div>

              {checkoutError && (
                <div style={{ fontSize: 11, color: 'var(--bad-text)', textAlign: 'center' }}>{checkoutError}</div>
              )}

              <button onClick={handleCheckout} disabled={!canCheckout || checking}
                style={{
                  width: '100%', padding: '12px 0', borderRadius: 10, fontSize: 13.5, fontWeight: 700,
                  background: canCheckout ? 'var(--accent)' : 'var(--surface-3)',
                  color: canCheckout ? '#fff' : 'var(--text-faint)',
                  border: 'none', cursor: canCheckout ? 'pointer' : 'not-allowed',
                  opacity: checking ? 0.7 : 1, transition: 'all .15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontFamily: 'var(--font-ui)',
                }}>
                <Icon name="check" size={14} sw={2.5} />
                {checking ? 'Processing…' : 'Complete Sale'}
              </button>

              {!customer.name.trim() && cart.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--warn-text)', textAlign: 'center', marginTop: -10 }}>Customer name is required</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Inventory View ───────────────────────────────────────────────────────────

// Full context for one product, opened by clicking its row — the table only has
// room for a scannable summary (name, category, price, stock).
function ProductDetailModal({ product, onClose }) {
  if (!product) return null
  const value = (product.retail_price || 0) * (product.qty_on_hand || 0)
  const stockColor = product.qty_on_hand <= 5 ? 'var(--bad-text)' : product.qty_on_hand <= (product.reorder_level ?? 10) ? 'var(--warn-text)' : 'var(--ok-text)'
  const Field = ({ label, children }) => (
    <div>
      <div className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-wider">{label}</div>
      <div className="text-sm text-[var(--text)] mt-0.5">{children}</div>
    </div>
  )
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 bg-[var(--surface-2)] border-b border-[var(--border)]">
          <div style={{ background: (CAT_COLORS[product.category] || '#6B7280') + '22', borderRadius: 10, width: 38, height: 38, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon name="box" size={17} sw={2} style={{ color: CAT_COLORS[product.category] || '#6B7280' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-[var(--text)] truncate">{product.name}</div>
            {product.sku && <div className="text-xs text-[var(--text-faint)] mono mt-0.5">{product.sku}</div>}
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg grid place-items-center flex-shrink-0" style={{ background: 'var(--surface-3)' }}>
            <Icon name="x" size={12} sw={2.4} style={{ color: 'var(--text-faint)' }} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                style={{ background: (CAT_COLORS[product.category] || '#6B7280') + '22', color: CAT_COLORS[product.category] || '#6B7280' }}>
                {product.category}
              </span>
            </Field>
            <Field label="Brand">{product.brand || '—'}</Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Retail Price"><span className="mono font-bold text-[var(--accent-text)]">{rs(product.retail_price)}</span></Field>
            {product.wholesale_price > 0 && <Field label="Wholesale Price"><span className="mono font-bold text-[var(--text)]">{rs(product.wholesale_price)}</span></Field>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="On Hand">
              <span className="mono font-bold" style={{ color: stockColor }}>{product.qty_on_hand} units</span>
              {product.qty_on_hand <= (product.reorder_level ?? 5) && <span className="ml-1.5 text-[10px] font-semibold" style={{ color: 'var(--warn-text)' }}>low</span>}
            </Field>
            <Field label="Inventory Value"><span className="mono text-[var(--text-dim)]">{rs(value)}</span></Field>
          </div>
          {product.warranty_months > 0 && <Field label="Warranty">{product.warranty_months} month{product.warranty_months !== 1 ? 's' : ''}</Field>}
          {product.specs && <Field label="Specifications">{product.specs}</Field>}
        </div>
      </div>
    </div>
  )
}

function InventoryView({ products, orgId = '' }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const inp = 'w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] transition-all placeholder:text-[var(--text-faint)]'

  const filtered = products.filter(p => {
    const q = search.toLowerCase()
    return p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
  })

  const lowStock = products.filter(p => p.qty_on_hand <= 5)

  return (
    <div className="flex flex-col gap-4">
      <ProductDetailModal product={selected} onClose={() => setSelected(null)} />

      {lowStock.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border text-sm"
          style={{ background: 'var(--warn-soft)', borderColor: 'rgba(245,158,11,0.35)', color: 'var(--warn-text)' }}>
          <Icon name="alert" size={16} sw={2} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <span className="font-bold">{lowStock.length} product{lowStock.length > 1 ? 's' : ''} low on stock:</span>{' '}
            {lowStock.map(p => p.name).join(', ')}
          </div>
        </div>
      )}

      <div className="relative">
        <Icon name="search" size={14} sw={2} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
        <input className={inp + ' pl-8'} placeholder="Search inventory…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-2.5 px-5 py-3.5 bg-[var(--surface-2)] border-b border-[var(--border)]">
          <Icon name="box" size={14} sw={2} style={{ color: 'var(--accent)' }} />
          <div className="text-sm font-bold text-[var(--text)]">Inventory ({filtered.length} products)</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                {['Product', 'Category', 'Brand', 'Retail Price', 'Stock', 'Value', ''].map((h, i) => (
                  <th key={i} className="text-left py-2.5 px-4 text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider first:pl-5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filtered.map((p, i) => (
                <tr key={i} onClick={() => setSelected(p)} className="hover:bg-[var(--surface-2)] transition-colors cursor-pointer group">
                  <td className="py-3 px-4 pl-5">
                    <div className="font-semibold text-[var(--text)]">{p.name}</div>
                    {p.sku && <div className="text-xs text-[var(--text-faint)] mono">{p.sku}</div>}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                      style={{ background: (CAT_COLORS[p.category] || '#6B7280') + '22', color: CAT_COLORS[p.category] || '#6B7280' }}>
                      {p.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--text-dim)]">{p.brand || '—'}</td>
                  <td className="py-3 px-4 mono font-bold text-sm text-[var(--accent-text)]">{rs(p.retail_price)}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="mono font-bold text-sm" style={{ color: p.qty_on_hand <= 5 ? 'var(--bad-text)' : p.qty_on_hand <= 10 ? 'var(--warn-text)' : 'var(--ok-text)' }}>
                        {p.qty_on_hand}
                      </span>
                      <div className="flex-1 h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden" style={{ maxWidth: 60 }}>
                        <div className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, (p.qty_on_hand / 50) * 100)}%`,
                            background: p.qty_on_hand <= 5 ? 'var(--bad)' : p.qty_on_hand <= 10 ? 'var(--warn)' : 'var(--ok)',
                          }} />
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 mono text-sm text-[var(--text-dim)]">{rs(p.retail_price * p.qty_on_hand)}</td>
                  <td className="py-3 px-4 pr-5 text-[var(--text-faint)] group-hover:text-[var(--accent)] transition-colors">
                    <Icon name="chev" size={13} sw={2} style={{ transform: 'rotate(-90deg)' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── My Sales ─────────────────────────────────────────────────────────────────

function LedgerView({ products, orgId = '', currentUser }) {
  const [sales, setSales]    = useState([])
  const [loading, setLoad]   = useState(true)
  const [search, setSearch]  = useState('')
  const [todayKpi, setToday] = useState({ count: 0, total: 0 })
  const [selectedInv, setSelectedInv] = useState(null)
  const [invItems, setInvItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voidBusy, setVoidBusy] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [orgSettings, setOrgSettings] = useState({})

  useEffect(() => {
    if (!orgId) return
    window.api.orgSettingsGet(orgId)
      .then(res => { if (res.success) setOrgSettings(res.data) })
      .catch(() => {})
  }, [orgId])

  const load = useCallback(async () => {
    try {
      const res = await window.api.salesGet(orgId)
      const rows = res?.success ? res.data : []
      setSales(rows)
      const today = rows.filter(r => !r.is_voided && r.local_created_at && new Date(r.local_created_at).toDateString() === new Date().toDateString())
      setToday({ count: today.length, total: today.reduce((s, r) => s + Number(r.final_amount), 0) })
    } catch {}
    setLoad(false)
  }, [orgId])

  useEffect(() => { load() }, [load])

  async function viewInvoice(inv) {
    setSelectedInv(inv)
    setVoiding(false)
    setVoidReason('')
    setLoadingItems(true)
    try {
      const res = await window.api.salesItemsGet(inv.id)
      setInvItems(res?.success ? res.data : [])
    } catch {}
    setLoadingItems(false)
  }

  async function handleVoid() {
    if (!voidReason.trim()) { toast.error('A reason is required'); return }
    setVoidBusy(true)
    try {
      const res = await window.api.salesVoid(selectedInv.id, voidReason.trim(), currentUser?.name || currentUser?.email || '')
      if (!res?.success) throw new Error(res?.error || 'Failed to void invoice')
      toast.success(`${selectedInv.invoice_number} voided — stock restored`)
      setSelectedInv(null)
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to void invoice')
    }
    setVoidBusy(false)
  }

  const filtered = sales.filter(s => {
    const q = search.toLowerCase()
    return !q || s.invoice_number?.toLowerCase().includes(q) ||
      s.customer_name?.toLowerCase().includes(q) ||
      s.customer_phone?.includes(q)
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Invoice detail modal */}
      {selectedInv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Invoice Detail</div>
                  {selectedInv.is_voided && <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: 'var(--bad-soft)', color: 'var(--bad-text)' }}>VOIDED</span>}
                </div>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-text)', marginTop: 2 }}>{selectedInv.invoice_number}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!selectedInv.is_voided && !voiding && (
                  <button onClick={() => setVoiding(true)} style={{ padding: '6px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: 'var(--bad-soft)', color: 'var(--bad-text)', border: '1px solid var(--bad)', cursor: 'pointer' }}>
                    Void Sale
                  </button>
                )}
                <button onClick={() => setSelectedInv(null)} style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'var(--surface-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="x" size={12} sw={2.4} style={{ color: 'var(--text-faint)' }} />
                </button>
              </div>
            </div>
            {voiding && (
              <div style={{ padding: '14px 18px', background: 'var(--bad-soft)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--bad-text)', marginBottom: 8 }}>
                  This cancels the sale and restores the sold stock to inventory. This cannot be undone.
                </div>
                <textarea autoFocus rows={2} value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Reason for voiding this sale (required)…"
                  style={{ width: '100%', fontSize: 13, borderRadius: 8, padding: '8px 10px', outline: 'none', background: 'var(--surface)', border: '1px solid var(--bad)', color: 'var(--text)' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={handleVoid} disabled={voidBusy || !voidReason.trim()} style={{ padding: '7px 16px', borderRadius: 7, fontSize: 11.5, fontWeight: 700, background: 'var(--bad)', color: '#fff', border: 'none', cursor: 'pointer', opacity: voidBusy || !voidReason.trim() ? 0.6 : 1 }}>
                    {voidBusy ? 'Voiding…' : 'Confirm Void'}
                  </button>
                  <button onClick={() => { setVoiding(false); setVoidReason('') }} style={{ padding: '7px 16px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, background: 'var(--surface)', color: 'var(--text-dim)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {selectedInv.is_voided && (
              <div style={{ padding: '10px 18px', background: 'var(--bad-soft)', borderBottom: '1px solid var(--border)', fontSize: 11.5, color: 'var(--bad-text)' }}>
                Voided {selectedInv.voided_at?.slice(0, 16).replace('T', ' ')}{selectedInv.voided_by ? ` by ${selectedInv.voided_by}` : ''}{selectedInv.void_reason ? ` — ${selectedInv.void_reason}` : ''}
              </div>
            )}
            <div style={{ overflow: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><div style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase' }}>Customer</div><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>{selectedInv.customer_name}</div>{selectedInv.customer_phone && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{selectedInv.customer_phone}</div>}</div>
                <div style={{ textAlign: 'right' }}><div style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase' }}>Date</div><div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text)', marginTop: 2 }}>{fmtDateTime(selectedInv.local_created_at)}</div></div>
              </div>
              {loadingItems ? <div style={{ textAlign: 'center', padding: 20 }}><Spinner /></div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Product', 'Qty', 'Unit Price', 'Total'].map((h, i) => <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '7px 10px', fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{invItems.map((it, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '9px 10px', fontWeight: 600, color: 'var(--text)' }}>
                        {it.product_name}
                        {it.warranty_expires_at && (
                          <div style={{ fontSize: 10, color: new Date(it.warranty_expires_at) >= new Date() ? 'var(--ok-text)' : 'var(--bad-text)', fontWeight: 600, marginTop: 1 }}>
                            🛡 Warranty {new Date(it.warranty_expires_at) >= new Date() ? 'until' : 'expired'} {it.warranty_expires_at}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{it.quantity}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{rs(it.unit_price)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text)' }}>{rs(it.line_total)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
              <div style={{ borderTop: '2px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {selectedInv.discount_amount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: 'var(--warn-text)' }}>Discount</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--warn-text)', fontWeight: 700 }}>-{rs(selectedInv.discount_amount)}</span></div>}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Total</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 16, color: 'var(--accent-text)' }}>{rs(selectedInv.final_amount)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: 'var(--ok-text)' }}>Paid</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ok-text)', fontWeight: 700 }}>{rs(selectedInv.amount_paid || 0)}</span></div>
                {(selectedInv.final_amount - (selectedInv.amount_paid || 0)) > 0.01 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: 'var(--bad-text)', fontWeight: 700 }}>Balance</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--bad-text)', fontWeight: 800 }}>{rs(selectedInv.final_amount - (selectedInv.amount_paid || 0))}</span></div>}
              </div>
            </div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              <button onClick={() => setPrinting(true)} disabled={loadingItems} style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: loadingItems ? 0.6 : 1 }}>Print Receipt</button>
              <button onClick={() => setSelectedInv(null)} style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-dim)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {printing && selectedInv && (
        <ReceiptModal invoice={{ ...selectedInv, created_at: selectedInv.local_created_at }} items={invItems}
          products={products} orgSettings={orgSettings} onClose={() => setPrinting(false)} />
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-2 shadow-sm">
          <span className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest">Today's Sales</span>
          <span className="mono font-extrabold text-2xl text-[var(--accent-text)]">{rs(todayKpi.total)}</span>
          <span className="text-xs text-[var(--text-faint)]">{todayKpi.count} invoice{todayKpi.count !== 1 ? 's' : ''}</span>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-2 shadow-sm">
          <span className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest">Total Invoices</span>
          <span className="mono font-extrabold text-2xl text-[var(--text)]">{sales.length}</span>
          <span className="text-xs text-[var(--text-faint)]">last 200 records</span>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-2 shadow-sm">
          <span className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest">All-Time Revenue</span>
          <span className="mono font-extrabold text-2xl text-[var(--ok-text)]">{rs(sales.reduce((s, r) => s + (r.is_voided ? 0 : Number(r.final_amount)), 0))}</span>
          <span className="text-xs text-[var(--text-faint)]">from visible records</span>
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-3 px-5 py-3.5 bg-[var(--surface-2)] border-b border-[var(--border)]">
          <Icon name="list" size={14} sw={2} style={{ color: 'var(--accent)' }} />
          <div className="text-sm font-bold text-[var(--text)]">Sales History</div>
          <div className="relative flex-1 max-w-72 ml-auto">
            <Icon name="search" size={12} sw={2} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
            <input
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-7 pr-3 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)] transition-all"
              placeholder="Search invoice #, customer…"
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button onClick={() => exportToExcel(`sales-history-${new Date().toISOString().slice(0, 10)}.xlsx`, filtered.map(s => ({
              'Invoice #': s.invoice_number, Customer: s.customer_name, Phone: s.customer_phone, Type: s.sale_type,
              Amount: s.final_amount, Paid: s.amount_paid, Status: s.is_voided ? 'Voided' : s.payment_status, Date: fmtDateTime(s.local_created_at),
            })))}
            disabled={!filtered.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: filtered.length ? 'var(--text-dim)' : 'var(--text-faint)', cursor: filtered.length ? 'pointer' : 'not-allowed' }}>
            <Icon name="download" size={12} sw={2} /> Export
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !filtered.length ? (
          <div className="flex flex-col items-center py-12 gap-3 text-[var(--text-faint)]">
            <Icon name="list" size={28} sw={1.5} />
            <span className="text-sm">{search ? 'No matching invoices' : 'No sales recorded yet'}</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Invoice #', 'Customer', 'Amount', 'Paid', 'Due', 'Status', 'Date', ''].map((h, i) => (
                    <th key={i} className="text-left py-2.5 px-4 text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider first:pl-5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map((s, i) => {
                  const balance = (parseFloat(s.final_amount) || 0) - (parseFloat(s.amount_paid) || 0)
                  return (
                    <tr key={i} onClick={() => viewInvoice(s)} className="hover:bg-[var(--surface-2)] transition-colors cursor-pointer group" style={s.is_voided ? { opacity: 0.55 } : undefined}>
                      <td className="py-3 px-4 pl-5 mono font-semibold text-[var(--accent-text)] text-xs">{s.invoice_number}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[var(--text)]">{s.customer_name}</div>
                        {s.customer_phone && <div className="text-xs text-[var(--text-faint)]">{s.customer_phone}</div>}
                      </td>
                      <td className="py-3 px-4 mono font-bold text-[var(--text)]" style={s.is_voided ? { textDecoration: 'line-through' } : undefined}>{rs(s.final_amount)}</td>
                      <td className="py-3 px-4 mono text-[var(--ok-text)]">{rs(s.amount_paid || 0)}</td>
                      <td className="py-3 px-4 mono text-xs" style={{ color: balance > 0.01 ? 'var(--bad-text)' : 'var(--text-faint)' }}>
                        {balance > 0.01 ? rs(balance) : '—'}
                        {s.due_date && balance > 0.01 && <div className="text-[10px]">{s.due_date}</div>}
                      </td>
                      <td className="py-3 px-4">
                        {s.is_voided
                          ? <span className="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'var(--bad-soft)', color: 'var(--bad-text)' }}>Voided</span>
                          : <DueStatusBadge status={s.payment_status} dueDate={s.due_date} />}
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--text-faint)] mono">{fmtDateTime(s.local_created_at)}</td>
                      <td className="py-3 px-4 text-[var(--text-faint)] group-hover:text-[var(--accent)] transition-colors">
                        <Icon name="chev" size={13} sw={2} style={{ transform: 'rotate(-90deg)' }} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function PosDashboard() {
  const { user } = useAuth()
  const ORG_ID = user?.org_id || ''
  const isDistributor = user?.role === 'distributor_user'
  const [view, setView]           = useState('pos')
  const [products, setProducts]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [prefillCart, setPrefill] = useState(null)   // set when converting a quote
  const [pendingCount, setPendingCount] = useState(0)

  const loadProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.api.productsGetWithStock(ORG_ID, true)
      setProducts(res?.success ? res.data : [])
    } catch {}
    setLoading(false)
  }, [ORG_ID])

  useEffect(() => { loadProducts() }, [loadProducts])

  // Pending-shipment badge — only meaningful (and only polled) for distributors.
  useEffect(() => {
    if (!isDistributor) return
    async function checkPending() {
      try {
        const res = await window.api.supplyIncoming(ORG_ID)
        if (res.success) setPendingCount((res.data || []).filter(o => o.receipt_status !== 'received').length)
      } catch {}
    }
    checkPending()
    const interval = setInterval(checkPending, 60000)
    return () => clearInterval(interval)
  }, [isDistributor, ORG_ID])

  const navItems = isDistributor
    ? [...BASE_NAV, ...DISTRIBUTOR_NAV.map(n => n.id === 'shipments' ? { ...n, badge: pendingCount } : n)]
    : BASE_NAV

  return (
    <AppLayout currentView={view} onViewChange={setView} navItems={navItems}>
      <DueAlertBanner orgId={ORG_ID} onViewDues={() => setView('dues')} />
      {loading && view === 'pos' ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <>
          {view === 'pos'       && <POSView products={products} orgId={ORG_ID} currentUser={user} prefill={prefillCart} onPrefillUsed={() => setPrefill(null)} />}
          {view === 'quotes'    && <Quotations orgId={ORG_ID} onConvertToSale={data => { setPrefill(data); setView('pos'); }} />}
          {view === 'returns'   && <ReturnReplace orgId={ORG_ID} currentUser={user} products={products} />}
          {view === 'dues'      && <DuePaymentsPanel orgId={ORG_ID} includeSupply={false} />}
          {view === 'inventory' && <InventoryView products={products} orgId={ORG_ID} />}
          {view === 'ledger'    && <LedgerView products={products} orgId={ORG_ID} currentUser={user} />}
          {isDistributor && view === 'overview'  && <OverviewView orgId={ORG_ID} />}
          {isDistributor && view === 'activity'  && <ActivityView orgId={ORG_ID} />}
          {isDistributor && view === 'shipments' && <IncomingShipmentsView orgId={ORG_ID} onConfirmed={() => { setPendingCount(c => Math.max(0, c - 1)); loadProducts() }} />}
          {isDistributor && view === 'account'   && <MainCompanyAccountView orgId={ORG_ID} />}
          {isDistributor && view === 'myproducts' && <MyProductsView products={products} orgId={ORG_ID} onRefresh={loadProducts} />}
          {isDistributor && view === 'suppliers' && <Suppliers products={products} orgId={ORG_ID} />}
          {isDistributor && view === 'staff'     && <StaffView orgId={ORG_ID} />}
          {isDistributor && view === 'settings'  && <OrgSettings orgId={ORG_ID} />}
        </>
      )}
    </AppLayout>
  )
}
