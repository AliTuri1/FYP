import { useState, useEffect, useCallback, useRef } from 'react'
import { Icon, Spinner } from './DesignSystem'
import { defaultDueDate, formatRs } from './DuePaymentsPanel'
import { CAT_COLORS } from './Charts'
import toast from 'react-hot-toast'

function rs(n) {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0)
  if (isNaN(num)) return 'Rs 0'
  return `Rs ${Math.round(num).toLocaleString('en-PK')}`
}

// If a product has no cost_price on file, we can't know the real cost — impute
// one as 82% of retail (an assumed ~18% retail margin) so the suggested wholesale
// price and margin % are still sensible. Every place that needs "the cost" for a
// supply order (suggested price, per-line margin, server-side COGS/profit
// reporting) MUST use this same function, or the numbers won't agree with each
// other depending on whether cost_price happens to be filled in.
function effectiveCost(prod) {
  return prod?.cost_price || (prod?.retail_price ? prod.retail_price * 0.82 : 0)
}

function ReceiptStatusBadge({ status }) {
  const map = {
    pending:  { bg: 'var(--warn-soft)', text: 'var(--warn-text)', label: 'Awaiting Confirmation' },
    received: { bg: 'var(--ok-soft)',   text: 'var(--ok-text)',   label: 'Stock Received ✓'      },
  }
  const s = map[status] || map.pending
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: s.bg, color: s.text }}>
      {s.label}
    </span>
  )
}

// ─── Margin Summary Card (top of supply tab) ─────────────────────────────────
function MarginSummary({ orgId }) {
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    window.api.supplyMarginSummary(orgId)
      .then(r => { if (r.success) setSummary(r.summary) })
      .catch(() => {})
  }, [orgId])

  if (!summary) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
      {[
        { label: 'Wholesale Charged',   value: rs(summary.total_wholesale), color: 'var(--accent-text)' },
        { label: 'Your Cost (COGS)',    value: rs(summary.total_cost),      color: 'var(--warn-text)'   },
        { label: 'Your Profit',         value: rs(summary.total_profit),    color: 'var(--ok-text)'     },
        { label: 'Avg Margin %',        value: `${summary.margin_pct.toFixed(1)}%`, color: summary.margin_pct >= 10 ? 'var(--ok-text)' : 'var(--bad-text)' },
      ].map((k, i) => (
        <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{k.label}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 16, color: k.color }}>{k.value}</div>
        </div>
      ))}
    </div>
  )
}

export default function DistributorSupply({ products, onRefresh, orgId = '' }) {
  const [distributors, setDistributors] = useState([])
  const [orders, setOrders]             = useState([])
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')
  const [expandedOrder, setExpanded]    = useState(null)

  const [distributorId, setDistributorId] = useState('')
  const [dueDate, setDueDate]             = useState(defaultDueDate(30))
  const [amountPaid, setAmountPaid]       = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [notes, setNotes]                 = useState('')
  const [lines, setLines]                 = useState([])
  const [line, setLine]                   = useState({ product_id: '', quantity: '', unit_price: '' })

  // Pricing scope for the order being built: one margin applied to every line,
  // or a wholesale price suggested (then freely editable) per product.
  const [marginMode, setMarginMode]       = useState('per_product') // 'per_product' | 'bulk'
  // How that margin is expressed — a % over cost, or a flat Rs amount added to
  // cost — used to compute the suggested price in BOTH scopes above.
  const [marginType, setMarginType]       = useState('pct') // 'pct' | 'fixed'
  const [marginValue, setMarginValue]     = useState('15')

  const prodMap = {}
  for (const p of products) prodMap[p.id] = p

  const seenReceivedIds = useRef(null) // null until first load, so we never toast for pre-existing history
  const isFirstLoad = useRef(true) // only the initial load should show the full loading state — background polls refresh silently so the page doesn't visibly "reload" every 20s

  const load = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true)
    try {
      const [distRes, orderRes] = await Promise.all([
        window.api.distributorsGet(),
        window.api.distributorSupplyGet(orgId),
      ])
      setDistributors(distRes?.data || [])
      const newOrders = orderRes?.data || []

      const receivedIds = new Set(newOrders.filter(o => o.receipt_status === 'received').map(o => o.id))
      if (seenReceivedIds.current) {
        for (const o of newOrders) {
          if (o.receipt_status === 'received' && !seenReceivedIds.current.has(o.id)) {
            toast.success(`${o.distributor_name || 'Distributor'} confirmed receipt of ${o.order_number}`, { duration: 6000, icon: '📦' })
          }
        }
      }
      seenReceivedIds.current = receivedIds

      setOrders(newOrders)
    } catch {}
    if (isFirstLoad.current) { setLoading(false); isFirstLoad.current = false }
  }, [orgId])

  useEffect(() => { load() }, [load])

  // Poll so a confirmation the distributor makes elsewhere shows up (and is
  // notified) without the admin having to leave and re-open this tab.
  useEffect(() => {
    const interval = setInterval(load, 20000)
    return () => clearInterval(interval)
  }, [load])

  function suggestedPrice(p) {
    const val = parseFloat(marginValue) || 0
    const cost = effectiveCost(p)
    return Math.round(marginType === 'pct' ? cost * (1 + val / 100) : cost + val)
  }

  function pickProduct(id) {
    const p = prodMap[id]
    if (!p) return
    setLine(l => ({
      ...l, product_id: id,
      unit_price: String(suggestedPrice(p)),
    }))
  }

  // Recompute every already-added line's price using the current margin —
  // lets the admin change the %/Rs after adding products and re-apply to all.
  function applyBulkMarginToAllLines() {
    const val = parseFloat(marginValue) || 0
    setLines(prev => prev.map(l => {
      const cost = l.cost_price || 0
      const newPrice = Math.round(marginType === 'pct' ? cost * (1 + val / 100) : cost + val)
      const marginPct = cost > 0 ? ((newPrice - cost) / cost * 100).toFixed(1) : '—'
      return { ...l, unit_price: newPrice, margin_pct: marginPct }
    }))
  }

  const canAddLine = line.product_id && parseInt(line.quantity) > 0
    && (marginMode === 'bulk' || parseFloat(line.unit_price) >= 0)
    && !lines.some(l => l.product_id === line.product_id)

  function addLine() {
    if (!canAddLine) return
    const p = prodMap[line.product_id]
    // In bulk mode the price field is a live, read-only preview of the current
    // margin % — always recompute from it here rather than trusting `line.unit_price`,
    // which could be stale if the % was changed after this product was selected.
    const wp = marginMode === 'bulk' ? suggestedPrice(p) : parseFloat(line.unit_price)
    const cost = effectiveCost(p)
    const margin = cost > 0 ? ((wp - cost) / cost * 100).toFixed(1) : '—'
    setLines(prev => [...prev, {
      product_id: line.product_id, product_name: p?.name, category: p?.category,
      quantity: parseInt(line.quantity), unit_price: wp,
      cost_price: cost, margin_pct: margin,
    }])
    setLine({ product_id: '', quantity: '', unit_price: '' })
  }

  const orderTotal = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
  const orderCost  = lines.reduce((s, l) => s + l.quantity * l.cost_price, 0)
  const orderProfit = orderTotal - orderCost

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!distributorId) { setError('Select a distributor'); return }
    if (!lines.length)  { setError('Add at least one product'); return }
    if (!dueDate)       { setError('Due date is required'); return }
    const paid = parseFloat(amountPaid) || 0
    if (paid > orderTotal) { setError('Amount paid cannot exceed order total'); return }

    setSaving(true)
    try {
      const res = await window.api.distributorSupplyCreate({
        from_org_id: orgId, distributor_id: distributorId,
        items: lines.map(l => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price })),
        amount_paid: paid, due_date: dueDate, payment_method: paymentMethod,
        notes, created_by: 'Admin',
      })
      if (!res?.success) throw new Error(res?.error || 'Failed to create supply order')
      toast.success(`Order ${res.order_number} sent to distributor. Stock will be added when they confirm receipt.`)
      setDistributorId(''); setLines([]); setAmountPaid(''); setNotes(''); setDueDate(defaultDueDate(30))
      load(); onRefresh?.()
    } catch (err) { setError(err.message) }
    setSaving(false)
  }

  const INP = { width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: 'var(--text)', outline: 'none' }

  if (loading && !orders.length) return <div className="flex justify-center py-20"><Spinner /></div>

  // Pending confirmation orders
  const pendingOrders  = orders.filter(o => o.receipt_status !== 'received')
  const receivedOrders = orders.filter(o => o.receipt_status === 'received')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Admin profit summary */}
      <MarginSummary orgId={orgId} />

      {/* Pending confirmation alert */}
      {pendingOrders.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, background: 'var(--warn-soft)', border: '1px solid rgba(245,158,11,0.4)' }}>
          <Icon name="alert" size={16} sw={2} style={{ color: 'var(--warn-text)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--warn-text)' }}>
            {pendingOrders.length} order{pendingOrders.length > 1 ? 's' : ''} awaiting distributor confirmation. Inventory will be added when distributor confirms receipt.
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20 }}>
        {/* Create order form */}
        <div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Send Stock to Distributor</div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>Stock leaves your warehouse immediately. Distributor's inventory updates when they confirm receipt.</div>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>Distributor *</label>
                <select style={INP} value={distributorId} onChange={e => setDistributorId(e.target.value)} required>
                  <option value="">Select distributor…</option>
                  {distributors.map(d => <option key={d.id} value={d.id}>{d.name} — {d.city}</option>)}
                </select>
              </div>

              {/* Pricing mode */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Pricing Mode</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ id: 'per_product', label: 'Set Per Product' }, { id: 'bulk', label: 'Same Margin for All' }].map(m => (
                    <button key={m.id} type="button" onClick={() => setMarginMode(m.id)} style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      background: marginMode === m.id ? 'var(--accent)' : 'var(--surface)',
                      color: marginMode === m.id ? '#fff' : 'var(--text-dim)',
                      border: `1px solid ${marginMode === m.id ? 'var(--accent)' : 'var(--border)'}`,
                    }}>{m.label}</button>
                  ))}
                </div>

                {/* Margin type (%/fixed) — used to compute the suggested price either way:
                    locked-in and auto-applied in "bulk" mode, or just a starting point the
                    admin can still edit per line in "per product" mode. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {[{ id: 'pct', label: 'Percentage' }, { id: 'fixed', label: 'Fixed Amount' }].map(t => (
                      <button key={t.id} type="button" onClick={() => setMarginType(t.id)} style={{
                        padding: '6px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        background: marginType === t.id ? 'var(--accent)' : 'var(--surface)',
                        color: marginType === t.id ? '#fff' : 'var(--text-dim)',
                        border: `1px solid ${marginType === t.id ? 'var(--accent)' : 'var(--border)'}`,
                      }}>{t.label}</button>
                    ))}
                  </div>
                  <div style={{ position: 'relative', width: 100 }}>
                    {marginType === 'fixed' && <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-faint)' }}>Rs</span>}
                    <input style={{ ...INP, fontFamily: 'var(--font-mono)', paddingRight: marginType === 'pct' ? 22 : 10, paddingLeft: marginType === 'fixed' ? 26 : 12 }}
                      type="number" min="0" step={marginType === 'pct' ? '0.5' : '1'}
                      value={marginValue} onChange={e => setMarginValue(e.target.value)} />
                    {marginType === 'pct' && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-faint)', pointerEvents: 'none' }}>%</span>}
                  </div>
                  <span style={{ fontSize: 10.5, color: 'var(--text-faint)', flex: 1 }}>
                    {marginMode === 'bulk' ? 'Applied automatically as you add products below.' : 'Fills the price when you pick a product — you can still edit it per line.'}
                  </span>
                  {marginMode === 'bulk' && lines.length > 0 && (
                    <button type="button" onClick={applyBulkMarginToAllLines}
                      style={{ padding: '7px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                      Apply to All Lines
                    </button>
                  )}
                </div>
              </div>

              {/* Add line */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Add Product</div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Product</label>
                    <select style={INP} value={line.product_id} onChange={e => pickProduct(e.target.value)}>
                      <option value="">Select…</option>
                      {products.filter(p => p.qty_on_hand > 0).map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.qty_on_hand} in stock)</option>
                      ))}
                    </select>
                    {line.product_id && prodMap[line.product_id] && (
                      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 3 }}>
                        Your cost: {rs(prodMap[line.product_id].cost_price)} · Retail: {rs(prodMap[line.product_id].retail_price)} · {marginMode === 'bulk' ? 'Wholesale' : 'Suggested wholesale'} at {marginType === 'pct' ? `${parseFloat(marginValue) || 0}%` : `Rs ${parseFloat(marginValue) || 0}`} margin: {rs(suggestedPrice(prodMap[line.product_id]))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Qty</label>
                    <input style={INP} type="number" min="1" placeholder="0" value={line.quantity} onChange={e => setLine(l => ({ ...l, quantity: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Wholesale Price</label>
                    <input style={{ ...INP, fontFamily: 'var(--font-mono)', opacity: marginMode === 'bulk' ? 0.7 : 1 }} type="number" min="0" placeholder="0"
                      value={marginMode === 'bulk' && line.product_id ? suggestedPrice(prodMap[line.product_id]) : line.unit_price}
                      readOnly={marginMode === 'bulk'}
                      onChange={e => setLine(l => ({ ...l, unit_price: e.target.value }))} />
                  </div>
                  <button type="button" onClick={addLine} disabled={!canAddLine} style={{ height: 38, padding: '0 14px', borderRadius: 8, background: canAddLine ? 'var(--accent)' : 'var(--surface-3)', color: canAddLine ? '#fff' : 'var(--text-faint)', border: 'none', fontSize: 12, fontWeight: 700, cursor: canAddLine ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="plus" size={13} sw={2.5} /> Add
                  </button>
                </div>
              </div>

              {/* Lines table */}
              {lines.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                      {['Product', 'Qty', 'Wholesale Price', 'Your Cost', 'Margin', 'Line Total', ''].map((h,i) => (
                        <th key={i} style={{ textAlign: i > 0 ? 'right' : 'left', padding: '8px 12px', fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{lines.map((l, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text)' }}>{l.product_name}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{l.quantity}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-text)', fontWeight: 700 }}>{rs(l.unit_price)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{rs(l.cost_price)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--ok-text)' }}>{l.margin_pct}%</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{rs(l.quantity * l.unit_price)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' }}><button type="button" onClick={() => setLines(p => p.filter((_,j) => j !== i))} style={{ width: 24, height: 24, borderRadius: 5, border: 'none', background: 'var(--bad-soft)', color: 'var(--bad-text)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={10} sw={2.5} /></button></td>
                      </tr>
                    ))}</tbody>
                    <tfoot><tr style={{ background: 'var(--surface-2)', borderTop: '2px solid var(--border)' }}>
                      <td colSpan={2} style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text)' }}>Totals</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--accent-text)' }}>{rs(orderTotal)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{rs(orderCost)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--ok-text)' }}>+{rs(orderProfit)}</td>
                      <td colSpan={2} />
                    </tr></tfoot>
                  </table>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>Payment Due Date *</label>
                  <input style={INP} type="date" value={dueDate} min={new Date().toISOString().slice(0, 10)} onChange={e => setDueDate(e.target.value)} required />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 }}>Amount Received Now</label>
                  <input style={{ ...INP, fontFamily: 'var(--font-mono)' }} type="number" min="0" placeholder="0 for full credit" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {['cash', 'bank'].map(m => (
                  <button key={m} type="button" onClick={() => setPaymentMethod(m)} style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: paymentMethod === m ? 'var(--accent)' : 'var(--surface-2)', color: paymentMethod === m ? '#fff' : 'var(--text-dim)', border: `1px solid ${paymentMethod === m ? 'var(--accent)' : 'var(--border)'}` }}>
                    {m === 'bank' ? 'Bank Transfer' : 'Cash'}
                  </button>
                ))}
              </div>

              <input style={INP} placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />

              {error && <div style={{ fontSize: 12, color: 'var(--bad-text)', fontWeight: 600 }}>{error}</div>}

              <button type="submit" disabled={saving || !lines.length || !distributorId} style={{ padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', background: saving || !lines.length || !distributorId ? 'var(--surface-3)' : 'var(--ok)', border: 'none', cursor: lines.length && distributorId ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: saving ? 0.7 : 1 }}>
                <Icon name="arrow" size={15} sw={2.5} />
                {saving ? 'Sending…' : 'Send Stock to Distributor'}
              </button>
            </form>
          </div>
        </div>

        {/* Order history */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Pending */}
          {pendingOrders.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', background: 'var(--warn-soft)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="clock" size={13} sw={2} style={{ color: 'var(--warn-text)' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--warn-text)' }}>Awaiting Confirmation ({pendingOrders.length})</span>
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                {pendingOrders.map(o => <OrderCard key={o.id} o={o} expanded={expandedOrder === o.id} onExpand={() => setExpanded(expandedOrder === o.id ? null : o.id)} />)}
              </div>
            </div>
          )}
          {/* Received */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="check" size={13} sw={2.5} style={{ color: 'var(--ok-text)' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Confirmed Orders ({receivedOrders.length})</span>
            </div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
              {!receivedOrders.length ? <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, color: 'var(--text-faint)' }}>No confirmed orders yet</div>
                : receivedOrders.slice(0, 10).map(o => <OrderCard key={o.id} o={o} expanded={expandedOrder === o.id} onExpand={() => setExpanded(expandedOrder === o.id ? null : o.id)} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function OrderCard({ o, expanded, onExpand }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <button onClick={onExpand} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'var(--surface-2)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, color: 'var(--accent-text)' }}>{o.order_number}</span>
            <ReceiptStatusBadge status={o.receipt_status} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{o.distributor_name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{o.created_at?.slice(0, 10)} · Due: {o.due_date}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>{rs(o.total_amount)}</div>
          {o.balance > 0.01 && <div style={{ fontSize: 10.5, color: 'var(--bad-text)', fontFamily: 'var(--font-mono)' }}>Bal: {rs(o.balance)}</div>}
        </div>
        <Icon name="chev" size={12} sw={2.2} style={{ color: 'var(--text-faint)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {expanded && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
          {(o.items || []).map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: i < o.items.length-1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ color: 'var(--text-dim)' }}>{it.product_name} × {it.quantity}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{rs(it.line_total)}</span>
            </div>
          ))}
          {o.received_at && <div style={{ fontSize: 11, color: 'var(--ok-text)', marginTop: 6 }}>✓ Received on {o.received_at?.slice(0, 10)} by {o.received_by || 'distributor'}</div>}
        </div>
      )}
    </div>
  )
}
