import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import AppLayout from '../components/AppLayout'
import { Icon, Spinner } from '../components/DesignSystem'
import { RevenueChart, SalesCountChart, TopProductsChart, CategoryDonut, CatLegend, CAT_COLORS } from '../components/Charts'
import DueAlertBanner from '../components/DueAlertBanner'
import DuePaymentsPanel, { DueStatusBadge } from '../components/DuePaymentsPanel'
import DistributorSupply from '../components/DistributorSupply'
import WarrantyClaims from './WarrantyClaims'
import DistributorPerformance from './DistributorPerformance'
import Suppliers from './Suppliers'
import ReturnReplace from './ReturnReplace'
import OrgSettings from './OrgSettings'
import SystemStatus from './SystemStatus'
import { useAuth } from '../contexts/AuthContext'
import { useOrganization } from '../contexts/OrganizationContext'
import { exportToExcel } from '../lib/exportExcel'
import { ReceiptModal, fmtDateTime } from '../components/Receipt'

// Sidebar groups related views under one clickable tab; each child keeps its
// original view id, so the render switch further down needs no changes.
const NAV = [
  { id: 'overview',  label: 'Overview',    sub: 'Dashboard & metrics',       icon: 'home' },
  { id: 'inventory', label: 'Inventory',   sub: 'Catalogue, stock & intake', icon: 'box', children: [
    { id: 'products', label: 'Products',      icon: 'box'      },
    { id: 'intake',   label: 'Stock Intake',  icon: 'download' },
    { id: 'ledger',   label: 'Stock Ledger',  icon: 'ledger'   },
    { id: 'batches',  label: 'Batch History', icon: 'clock'    },
  ]},
  { id: 'suppliers', label: 'Suppliers',   sub: 'Bills & amounts owed',      icon: 'cart' },
  { id: 'sales',     label: 'Sales',       sub: 'Invoices, dues & claims',   icon: 'list', children: [
    { id: 'sales',    label: 'Sales History',  icon: 'list'     },
    { id: 'dues',     label: 'Due Payments',   icon: 'card'     },
    { id: 'returns',  label: 'Returns',        icon: 'arrow-up' },
    { id: 'warranty', label: 'Warranty',       icon: 'shield'   },
  ]},
  { id: 'network',   label: 'Distributors', sub: 'Branch network & supply',  icon: 'zap', children: [
    { id: 'distributors', label: 'Branch Reports',      icon: 'zap'   },
    { id: 'supply',       label: 'Distributor Supply',  icon: 'arrow' },
  ]},
  { id: 'staff',     label: 'All Users',   sub: 'Distributors & staff',      icon: 'users' },
  { id: 'activity',  label: 'Activity',    sub: 'Recent activity, every branch', icon: 'lightning' },
  { id: 'admin',     label: 'Settings',    sub: 'System, receipts & help',   icon: 'edit', children: [
    { id: 'settings', label: 'Receipt Settings', icon: 'edit'  },
    { id: 'system',   label: 'System',           icon: 'cloud' },
    { id: 'help',     label: 'Help',             icon: 'info'  },
  ]},
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rs(n) {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0)
  if (isNaN(num)) return 'Rs 0'
  return `Rs ${Math.round(num).toLocaleString('en-PK')}`
}

function fillDays(rows, n) {
  const map = {}
  for (const r of rows) map[r.date] = r
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (n - 1 - i))
    const dateStr = d.toISOString().slice(0, 10)
    return {
      label: dateStr.slice(5),
      date:  dateStr,
      revenue: Number(map[dateStr]?.revenue || 0),
      count:   Number(map[dateStr]?.count   || 0),
    }
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, color = 'teal' }) {
  const colors = {
    teal:    { bg: 'rgba(20,184,166,0.12)',  icon: '#14B8A6' },
    emerald: { bg: 'rgba(16,185,129,0.12)',  icon: '#10B981' },
    amber:   { bg: 'rgba(245,158,11,0.12)',  icon: '#F59E0B' },
    blue:    { bg: 'rgba(59,130,246,0.12)',  icon: '#3B82F6' },
  }
  const c = colors[color] || colors.teal
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest">{label}</span>
        <div style={{ background: c.bg, borderRadius: 8, width: 34, height: 34, display: 'grid', placeItems: 'center' }}>
          <Icon name={icon} size={16} sw={2} style={{ color: c.icon }} />
        </div>
      </div>
      <div>
        <div className="text-2xl font-extrabold text-[var(--text)] mono tracking-tight leading-none">{value}</div>
        {sub && <div className="text-xs text-[var(--text-faint)] mt-1.5">{sub}</div>}
      </div>
    </div>
  )
}

function Section({ title, sub, icon, action, children }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-3.5 bg-[var(--surface-2)] border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          {icon && <Icon name={icon} size={14} sw={2} style={{ color: 'var(--accent)' }} />}
          <div>
            <div className="text-sm font-bold text-[var(--text)]">{title}</div>
            {sub && <div className="text-xs text-[var(--text-faint)]">{sub}</div>}
          </div>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function DataTable({ cols, rows, emptyMsg = 'No data', loading, onRowClick }) {
  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>
  if (!rows?.length) return (
    <div className="flex flex-col items-center py-12 gap-3 text-[var(--text-faint)]">
      <Icon name="box" size={28} sw={1.5} />
      <span className="text-sm">{emptyMsg}</span>
    </div>
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            {cols.map((c, i) => (
              <th key={i} className="text-left py-2.5 px-3 text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider first:pl-0 last:pr-0">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((row, ri) => (
            <tr key={ri} onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`hover:bg-[var(--surface-2)] transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}>
              {cols.map((c, ci) => (
                <td key={ci} className="py-3 px-3 first:pl-0 last:pr-0">
                  {c.render ? c.render(row) : <span className="text-[var(--text-dim)]">{row[c.key]}</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CatChip({ cat }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
      style={{ background: (CAT_COLORS[cat] || '#6B7280') + '22', color: CAT_COLORS[cat] || '#6B7280' }}>
      {cat}
    </span>
  )
}

function StatusBadge({ status, dueDate }) {
  if (['paid', 'partial', 'pending', 'overdue'].includes(status)) {
    return <DueStatusBadge status={status} dueDate={dueDate} />
  }
  const map = {
    completed: { label: 'Paid', bg: 'var(--ok-soft)',   color: 'var(--ok-text)'   },
    paid:      { label: 'Paid', bg: 'var(--ok-soft)',   color: 'var(--ok-text)'   },
    pending:   { label: 'Pending',   bg: 'var(--warn-soft)', color: 'var(--warn-text)' },
    partial:   { label: 'Partial',   bg: 'var(--info-soft)', color: 'var(--info-text)' },
    overdue:   { label: 'Overdue',   bg: 'var(--bad-soft)',  color: 'var(--bad-text)'  },
    cancelled: { label: 'Cancelled', bg: 'var(--bad-soft)',  color: 'var(--bad-text)'  },
  }
  const s = map[status] || map.pending
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: s.bg, color: s.color }}>{s.label}</span>
  )
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function OverviewView({ kpi, dailyRev, catRev, topProducts, loading, onViewLowStock }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Today's Revenue"   value={rs(kpi?.today_revenue)} sub={`${kpi?.today_count || 0} invoices today`}         icon="zap"   color="teal"    />
        <KpiCard label="Revenue (30 days)" value={rs(kpi?.rev30d)}        sub={`${kpi?.count30d || 0} invoices`}                   icon="chart" color="emerald" />
        <div onClick={onViewLowStock} style={{ cursor: onViewLowStock ? 'pointer' : 'default' }}>
          <KpiCard label="Inventory Value"   value={rs(kpi?.inv_value)}     sub={`${kpi?.low_stock || 0} products low on stock — click to view`}     icon="box"   color="amber"   />
        </div>
        <KpiCard label="All-Time Revenue"  value={rs(kpi?.total_revenue)} sub={`${kpi?.total_sales || 0} total invoices`}          icon="star"  color="blue"    />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] bg-[var(--surface-2)]">
            <div>
              <div className="text-sm font-bold text-[var(--text)]">Revenue — Last 30 Days</div>
              <div className="text-xs text-[var(--text-faint)] mt-0.5">Daily totals in PKR</div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)]">30d</span>
          </div>
          <div className="p-5">
            {loading ? <div className="flex justify-center py-8"><Spinner /></div> : <RevenueChart data={dailyRev} />}
          </div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-[var(--border)] bg-[var(--surface-2)]">
            <div className="text-sm font-bold text-[var(--text)]">Revenue by Category</div>
            <div className="text-xs text-[var(--text-faint)] mt-0.5">All-time breakdown</div>
          </div>
          <div className="p-5">
            {loading ? <div className="flex justify-center py-8"><Spinner /></div> : (
              <>
                <div style={{ height: 170 }}><CategoryDonut data={catRev} /></div>
                <CatLegend data={catRev} />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-[var(--border)] bg-[var(--surface-2)]">
            <div className="text-sm font-bold text-[var(--text)]">Sales Volume — 30 Days</div>
            <div className="text-xs text-[var(--text-faint)] mt-0.5">Invoices per day</div>
          </div>
          <div className="p-5">
            {loading ? <div className="flex justify-center py-6"><Spinner /></div> : <SalesCountChart data={dailyRev} />}
          </div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-[var(--border)] bg-[var(--surface-2)]">
            <div className="text-sm font-bold text-[var(--text)]">Top Products by Revenue</div>
            <div className="text-xs text-[var(--text-faint)] mt-0.5">All-time · Top 6</div>
          </div>
          <div className="p-5">
            {loading ? <div className="flex justify-center py-6"><Spinner /></div> : <TopProductsChart data={topProducts} />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Products ─────────────────────────────────────────────────────────────────

const WARRANTY_OPTS = [
  { months: 0,  label: 'No Warranty' },
  { months: 3,  label: '3 Months' },
  { months: 6,  label: '6 Months' },
  { months: 12, label: '1 Year' },
  { months: 24, label: '2 Years' },
  { months: 36, label: '3 Years' },
]

function ProductsView({ products, loading, onRefresh, orgId = '', initialLowStockOnly = false, onConsumedLowStockJump }) {
  const [search, setSearch]         = useState('')
  const [catFilter, setFilter]      = useState('All')
  const [lowOnly, setLowOnly]       = useState(initialLowStockOnly)

  useEffect(() => { if (initialLowStockOnly) onConsumedLowStockJump?.() }, [])
  const [showAdd, setShowAdd]       = useState(false)
  const [editingId, setEditing]     = useState(null)
  // New products default to "% markup" pricing off these starting percentages —
  // each product can then be switched to "Fixed price" or given its own % independently.
  const DEFAULT_RETAIL_PCT = 13
  const DEFAULT_WHOLESALE_PCT = 5
  const EMPTY_FORM = {
    name: '', category: 'Solar', brand: '', cost_price: '',
    retail_mode: 'pct', retail_price: '', retail_markup_pct: String(DEFAULT_RETAIL_PCT),
    wholesale_mode: 'pct', wholesale_price: '', wholesale_markup_pct: String(DEFAULT_WHOLESALE_PCT),
    reorder_level: '5', image_path: '', is_active: true, warranty_months: 0,
  }
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [importing, setImporting]   = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [pickingImg, setPickingImg] = useState(null)
  const [categories, setCategories] = useState([])
  const [newCatName, setNewCatName] = useState('')
  const [addingCat, setAddingCat]   = useState(false)

  const cost = parseFloat(form.cost_price) || 0
  const computedRetail = form.retail_mode === 'pct'
    ? Math.round(cost * (1 + (parseFloat(form.retail_markup_pct) || 0) / 100))
    : (parseFloat(form.retail_price) || 0)
  const computedWholesale = form.wholesale_mode === 'pct'
    ? Math.round(cost * (1 + (parseFloat(form.wholesale_markup_pct) || 0) / 100))
    : (parseFloat(form.wholesale_price) || 0)

  const loadCategories = useCallback(async () => {
    const res = await window.api.categoriesGet()
    if (res.success) setCategories(res.data)
  }, [])
  useEffect(() => { loadCategories() }, [loadCategories])

  const catNames = categories.map(c => c.name)

  async function handleAddCategory() {
    const name = newCatName.trim()
    if (!name) return
    setAddingCat(true)
    try {
      const res = await window.api.categoriesCreate(name)
      if (!res.success) throw new Error(res.error)
      toast.success(res.alreadyExisted ? `"${name}" already exists` : `Category "${name}" added`)
      setNewCatName('')
      await loadCategories()
      setForm(f => ({ ...f, category: name }))
    } catch (err) {
      toast.error(err.message || 'Failed to add category')
    }
    setAddingCat(false)
  }

  const filtered = (Array.isArray(products) ? products : []).filter(p => {
    const q = search.toLowerCase()
    return (catFilter === 'All' || p.category === catFilter) &&
      (!lowOnly || (p.qty_on_hand ?? 0) <= (p.reorder_level || 5)) &&
      (p.name?.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
  })

  function startEdit(p) {
    setEditing(p.id)
    setForm({
      name: p.name, category: p.category, brand: p.brand || '', cost_price: String(p.cost_price || 0),
      retail_mode: (p.retail_markup_pct !== null && p.retail_markup_pct !== undefined) ? 'pct' : 'fixed',
      retail_price: String(p.retail_price), retail_markup_pct: String(p.retail_markup_pct ?? DEFAULT_RETAIL_PCT),
      wholesale_mode: (p.wholesale_markup_pct !== null && p.wholesale_markup_pct !== undefined) ? 'pct' : 'fixed',
      wholesale_price: String(p.wholesale_price || 0), wholesale_markup_pct: String(p.wholesale_markup_pct ?? DEFAULT_WHOLESALE_PCT),
      reorder_level: String(p.reorder_level || 5), image_path: p.image_path || '', is_active: p.is_active !== false, warranty_months: p.warranty_months || 0,
    })
    setShowAdd(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name || !computedRetail) return
    setSaving(true)
    try {
      const pricing = {
        retail_price: computedRetail, wholesale_price: computedWholesale,
        retail_markup_pct: form.retail_mode === 'pct' ? (parseFloat(form.retail_markup_pct) || 0) : null,
        wholesale_markup_pct: form.wholesale_mode === 'pct' ? (parseFloat(form.wholesale_markup_pct) || 0) : null,
      }
      if (editingId) {
        const res = await window.api.productsUpdate({
          id: editingId, name: form.name, category: form.category, brand: form.brand,
          cost_price: parseFloat(form.cost_price) || 0, ...pricing,
          reorder_level: parseInt(form.reorder_level) || 5, image_path: form.image_path || '',
          is_active: form.is_active !== false, warranty_months: form.warranty_months,
        })
        if (!res.success) throw new Error(res.error)
        toast.success(`${form.name} updated`)
        setEditing(null)
      } else {
        const res = await window.api.productsCreate({
          name: form.name, category: form.category, brand: form.brand,
          cost_price: parseFloat(form.cost_price) || 0, ...pricing,
          reorder_level: parseInt(form.reorder_level) || 5, image_path: form.image_path || '',
          warranty_months: form.warranty_months,
        })
        if (!res.success) throw new Error(res.error)
        await window.api.inventoryUpdate(orgId, res.id, 0)
        toast.success(`${form.name} added`)
        setShowAdd(false)
      }
      setForm(EMPTY_FORM)
      onRefresh()
    } catch (err) {
      toast.error(err.message || 'Failed to save product')
    }
    setSaving(false)
  }

  async function toggleActive(p) {
    try { await window.api.productsUpdate({ ...p, is_active: !p.is_active }); onRefresh() } catch {}
  }

  async function handlePickImage(productId) {
    setPickingImg(productId || 'new')
    try {
      const res = await window.api.productsPickImage(productId)
      if (res.success) {
        if (!productId || editingId === productId) setForm(f => ({ ...f, image_path: res.imagePath }))
        if (productId) onRefresh()
      }
    } catch {}
    setPickingImg(null)
  }

  async function handleDelete(p) {
    if (!window.confirm(`Permanently delete "${p.name}"? This cannot be undone.`)) return
    const res = await window.api.productsDelete(p.id)
    if (res.success) {
      toast.success(`${p.name} deleted`)
      onRefresh()
    } else {
      toast.error(res.error || 'Failed to delete product')
    }
  }

  async function handleImportExcel() {
    setImporting(true)
    setImportResult(null)
    try {
      const res = await window.api.productsImportExcel()
      if (!res.canceled) { setImportResult(res); if (res.success && res.imported > 0) onRefresh() }
    } catch (err) { setImportResult({ success: false, error: err.message }) }
    setImporting(false)
  }

  const inp = 'w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] transition-all placeholder:text-[var(--text-faint)]'

  const formPanel = (title) => (
    <form onSubmit={handleSave} className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-5 shadow-sm">
      <div className="text-sm font-bold text-[var(--text)] mb-4">{title}</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-semibold text-[var(--text-faint)] mb-1.5 block">Product Name *</label>
          <input className={inp} required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Longi 200W Mono Panel" />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--text-faint)] mb-1.5 block">Category</label>
          <select className={inp} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
            {!catNames.includes(form.category) && form.category && <option value={form.category}>{form.category}</option>}
            {catNames.map(c => <option key={c}>{c}</option>)}
          </select>
          <div className="flex items-center gap-1.5 mt-1.5">
            <input
              className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-md px-2 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
              placeholder="New category name…" value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory() } }}
            />
            <button type="button" onClick={handleAddCategory} disabled={addingCat || !newCatName.trim()}
              className="px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap"
              style={{ background: newCatName.trim() ? 'var(--accent-soft)' : 'var(--surface-3)', color: newCatName.trim() ? 'var(--accent-text)' : 'var(--text-faint)', border: `1px solid ${newCatName.trim() ? 'var(--accent)' : 'var(--border)'}` }}>
              + Add
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--text-faint)] mb-1.5 block">Brand</label>
          <input className={inp} value={form.brand} onChange={e => setForm(p => ({ ...p, brand: e.target.value }))} placeholder="e.g. Longi" />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--text-faint)] mb-1.5 block">Cost Price (PKR)</label>
          <input className={inp + ' mono'} type="number" value={form.cost_price} onChange={e => setForm(p => ({ ...p, cost_price: e.target.value }))} placeholder="0" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-[var(--text-faint)] block">Retail Price (PKR) *</label>
            <div className="flex gap-1">
              {[{ id: 'pct', label: '% Markup' }, { id: 'fixed', label: 'Fixed' }].map(m => (
                <button key={m.id} type="button"
                  onClick={() => setForm(p => ({ ...p, retail_mode: m.id, ...(m.id === 'fixed' ? { retail_price: String(computedRetail) } : {}) }))}
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: form.retail_mode === m.id ? 'var(--accent-soft)' : 'transparent', color: form.retail_mode === m.id ? 'var(--accent-text)' : 'var(--text-faint)' }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {form.retail_mode === 'pct' ? (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input className={inp + ' mono'} style={{ paddingRight: 26 }} type="number" min="0" step="0.5"
                  value={form.retail_markup_pct} onChange={e => setForm(p => ({ ...p, retail_markup_pct: e.target.value }))} placeholder="13" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-faint)] pointer-events-none">%</span>
              </div>
              <span className="text-xs mono text-[var(--text-dim)] whitespace-nowrap">= Rs {computedRetail}</span>
            </div>
          ) : (
            <input className={inp + ' mono'} type="number" required value={form.retail_price} onChange={e => setForm(p => ({ ...p, retail_price: e.target.value }))} placeholder="0" />
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-[var(--text-faint)] block">Wholesale / Distributor Price (PKR)</label>
            <div className="flex gap-1">
              {[{ id: 'pct', label: '% Markup' }, { id: 'fixed', label: 'Fixed' }].map(m => (
                <button key={m.id} type="button"
                  onClick={() => setForm(p => ({ ...p, wholesale_mode: m.id, ...(m.id === 'fixed' ? { wholesale_price: String(computedWholesale) } : {}) }))}
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: form.wholesale_mode === m.id ? 'var(--accent-soft)' : 'transparent', color: form.wholesale_mode === m.id ? 'var(--accent-text)' : 'var(--text-faint)' }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {form.wholesale_mode === 'pct' ? (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input className={inp + ' mono'} style={{ paddingRight: 26 }} type="number" min="0" step="0.5"
                  value={form.wholesale_markup_pct} onChange={e => setForm(p => ({ ...p, wholesale_markup_pct: e.target.value }))} placeholder="5" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-faint)] pointer-events-none">%</span>
              </div>
              <span className="text-xs mono text-[var(--text-dim)] whitespace-nowrap">= Rs {computedWholesale}</span>
            </div>
          ) : (
            <input className={inp + ' mono'} type="number" value={form.wholesale_price} onChange={e => setForm(p => ({ ...p, wholesale_price: e.target.value }))} placeholder="0" />
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--text-faint)] mb-1.5 block">Reorder Level</label>
          <input className={inp + ' mono'} type="number" min="0" value={form.reorder_level} onChange={e => setForm(p => ({ ...p, reorder_level: e.target.value }))} placeholder="5" />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--text-faint)] mb-1.5 block">Warranty</label>
          <select className={inp} value={form.warranty_months} onChange={e => setForm(p => ({ ...p, warranty_months: parseInt(e.target.value) }))}>
            {WARRANTY_OPTS.map(w => <option key={w.months} value={w.months}>{w.label}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs font-semibold text-[var(--text-faint)] mb-1.5 block">Product Image</label>
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0" style={{ width: 120, height: 120 }}>
              {form.image_path ? (
                <img src={form.image_path} alt="" className="w-full h-full rounded-xl object-cover border border-[var(--border)]" onError={e => e.target.style.display='none'} />
              ) : (
                <div className="w-full h-full rounded-xl border border-dashed border-[var(--border)] flex items-center justify-center bg-[var(--surface)]">
                  <Icon name="box" size={28} sw={1.5} style={{ color: 'var(--text-faint)' }} />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 items-start">
              <button type="button" onClick={() => handlePickImage(editingId)} disabled={pickingImg === (editingId || 'new')}
                className="px-3 py-2 rounded-lg text-xs font-semibold border border-[var(--border)] bg-[var(--surface)] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors">
                {pickingImg === (editingId || 'new') ? 'Selecting…' : '📷 Choose Image'}
              </button>
              {form.image_path && (
                <button type="button" onClick={() => setForm(p => ({ ...p, image_path: '' }))}
                  className="px-3 py-2 rounded-lg text-xs font-semibold border border-[var(--border)] bg-[var(--surface)] hover:opacity-80 transition-opacity" style={{ color: 'var(--bad-text)' }}>
                  Remove Image
                </button>
              )}
              <span className="text-[10px] text-[var(--text-faint)]">Square images look best — shown cropped to 1:1 everywhere in the app.</span>
            </div>
          </div>
        </div>
        {editingId && (
          <div>
            <label className="text-xs font-semibold text-[var(--text-faint)] mb-1.5 block">Status</label>
            <button type="button" onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
              className="w-full px-3 py-2 rounded-lg text-xs font-semibold border transition-colors text-left"
              style={{
                background: form.is_active ? 'var(--ok-soft)' : 'var(--bad-soft)',
                color: form.is_active ? 'var(--ok-text)' : 'var(--bad-text)',
                borderColor: form.is_active ? 'var(--ok)' : 'var(--bad)',
              }}>
              {form.is_active ? '✓ Active — visible in POS' : '✕ Inactive — hidden from POS'}
            </button>
          </div>
        )}
      </div>
      <div className="flex gap-2 mt-4">
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--accent)', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
        </button>
        <button type="button" onClick={() => { setShowAdd(false); setEditing(null); setForm(EMPTY_FORM) }} className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text-dim)] bg-[var(--surface)] border border-[var(--border)]">Cancel</button>
      </div>
    </form>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Icon name="search" size={14} sw={2} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
          <input className={inp + ' pl-8'} placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['All', ...catNames].map(c => (
            <button key={c} onClick={() => setFilter(c)} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: catFilter === c ? 'var(--accent-soft)' : 'var(--surface)', color: catFilter === c ? 'var(--accent-text)' : 'var(--text-dim)', border: `1px solid ${catFilter === c ? 'var(--accent)' : 'var(--border)'}` }}>
              {c}
            </button>
          ))}
          <button onClick={() => setLowOnly(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: lowOnly ? 'var(--bad-soft)' : 'var(--surface)', color: lowOnly ? 'var(--bad-text)' : 'var(--text-dim)', border: `1px solid ${lowOnly ? 'var(--bad)' : 'var(--border)'}` }}>
            <Icon name="alert" size={12} sw={2} /> Low Stock
          </button>
        </div>
        <button onClick={handleImportExcel} disabled={importing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
          <Icon name="download" size={13} sw={2} />
          {importing ? 'Importing…' : 'Import Excel'}
        </button>
        <button onClick={() => { setShowAdd(v => { const next = !v; if (next) setForm(EMPTY_FORM); return next }); setEditing(null) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>
          <Icon name="plus" size={14} sw={2.5} /> Add Product
        </button>
      </div>

      {/* Excel download template hint */}
      <div className="text-xs text-[var(--text-faint)] px-1">
        Excel columns: <span className="mono text-[var(--text-dim)]">Name · Category · Brand · Retail Price · Cost Price · Reorder Level · SKU</span>
      </div>

      {/* Import result */}
      {importResult && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border text-sm"
          style={{ background: importResult.success ? 'var(--ok-soft)' : 'var(--bad-soft)', borderColor: importResult.success ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)', color: importResult.success ? 'var(--ok-text)' : 'var(--bad-text)' }}>
          <Icon name={importResult.success ? 'check' : 'alert'} size={16} sw={2} style={{ flexShrink: 0, marginTop: 1 }} />
          <div className="flex-1">
            <div className="font-bold">{importResult.success ? `✓ ${importResult.imported} products imported` : `Import failed: ${importResult.error}`}</div>
            {importResult.errors?.length > 0 && (
              <div className="mt-1 text-xs opacity-80">{importResult.errors.slice(0, 3).join(' · ')}{importResult.errors.length > 3 ? ` … +${importResult.errors.length - 3} more` : ''}</div>
            )}
          </div>
          <button onClick={() => setImportResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6 }}>
            <Icon name="x" size={13} sw={2.5} style={{ color: 'currentColor' }} />
          </button>
        </div>
      )}

      {showAdd && !editingId && formPanel('New Product')}
      {editingId && formPanel('Edit Product')}

      <Section title={`Products (${filtered.length})`} sub="Click Edit to update or add an image" icon="box">
        <DataTable loading={loading} emptyMsg="No products found. Add one above or import from Excel." rows={filtered}
          cols={[
            { label: '', render: r => (
              <div className="relative group w-10 h-10 flex-shrink-0">
                {r.image_path
                  ? <img src={r.image_path} alt="" className="w-10 h-10 rounded-lg object-cover border border-[var(--border)]" onError={e => { e.target.style.display='none'; e.target.nextSibling?.style && (e.target.nextSibling.style.display='flex') }} />
                  : null}
                <div className={`${r.image_path ? 'hidden' : 'flex'} w-10 h-10 rounded-lg border border-dashed border-[var(--border)] items-center justify-center`}>
                  <Icon name="box" size={13} sw={1.5} style={{ color: 'var(--text-faint)' }} />
                </div>
                <button onClick={() => handlePickImage(r.id)} disabled={pickingImg === r.id}
                  className="absolute inset-0 rounded-lg bg-black/50 hidden group-hover:flex items-center justify-center text-white text-xs font-bold cursor-pointer"
                  style={{ border: 'none' }} title="Change image">
                  {pickingImg === r.id ? '…' : '📷'}
                </button>
              </div>
            )},
            { label: 'Product', render: r => (
              <div>
                <div className="font-semibold text-[var(--text)] text-sm">{r.name}</div>
                <div className="flex gap-2 mt-0.5">
                  {r.brand && <span className="text-xs text-[var(--text-faint)]">{r.brand}</span>}
                  {r.sku   && <span className="text-xs mono text-[var(--text-faint)]">{r.sku}</span>}
                </div>
              </div>
            )},
            { label: 'Category', render: r => <CatChip cat={r.category} /> },
            { label: 'Retail',   render: r => <span className="mono font-bold text-[var(--accent-text)] text-sm">{rs(r.retail_price)}</span> },
            { label: 'Wholesale', render: r => r.wholesale_price > 0 ? <span className="mono text-sm" style={{ color: 'var(--ok-text)' }}>{rs(r.wholesale_price)}</span> : <span className="text-xs text-[var(--text-faint)]">—</span> },
            { label: 'Cost',     render: r => <span className="mono text-[var(--text-dim)] text-sm">{rs(r.cost_price)}</span> },
            { label: 'Margin',   render: r => {
              const m = r.retail_price > 0 ? ((r.retail_price - r.cost_price) / r.retail_price * 100).toFixed(0) : 0
              return <span className="font-bold text-sm" style={{ color: Number(m) >= 20 ? 'var(--ok-text)' : 'var(--warn-text)' }}>{m}%</span>
            }},
            { label: 'Stock', render: r => (
              <span className="mono font-semibold text-sm" style={{ color: (r.qty_on_hand ?? 0) <= (r.reorder_level || 5) ? 'var(--bad-text)' : 'var(--ok-text)' }}>
                {r.qty_on_hand ?? 0} <span className="text-xs text-[var(--text-faint)] font-normal">/ {r.reorder_level || 5}</span>
              </span>
            )},
            { label: 'Warranty', render: r => (
              r.warranty_months > 0
                ? <span className="text-xs font-semibold" style={{ color: 'var(--accent-text)' }}>{WARRANTY_OPTS.find(w => w.months === r.warranty_months)?.label || `${r.warranty_months} mo`}</span>
                : <span className="text-xs text-[var(--text-faint)]">—</span>
            )},
            { label: '', render: r => (
              <div className="flex gap-1.5">
                <button onClick={() => startEdit(r)} className="px-2 py-1 rounded text-xs font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)', border: '1px solid var(--accent)' }}>Edit</button>
                <button onClick={() => toggleActive(r)} className="px-2 py-1 rounded text-xs font-semibold" style={{ background: r.is_active ? 'var(--bad-soft)' : 'var(--ok-soft)', color: r.is_active ? 'var(--bad-text)' : 'var(--ok-text)', border: `1px solid ${r.is_active ? 'var(--bad)' : 'var(--ok)'}` }}>
                  {r.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => handleDelete(r)} title="Permanently delete (only if it has no sales/order history)" className="px-2 py-1 rounded text-xs font-semibold" style={{ background: 'var(--surface-3)', color: 'var(--text-faint)', border: '1px solid var(--border)' }}>
                  <Icon name="trash" size={12} sw={2} />
                </button>
              </div>
            )},
          ]}
        />
      </Section>
    </div>
  )
}

// ─── Stock Intake ─────────────────────────────────────────────────────────────

function defaultDueDate(days = 14) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function IntakeView({ products, onRefresh, orgId = '' }) {
  const [supplierId, setSupplierId] = useState('')
  const [reference, setReference] = useState('')
  const [line, setLine] = useState({ product_id: '', quantity: '', unit_cost: '' })
  const [lines, setLines] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)
  const [batches, setBatches] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [amountPaid, setAmountPaid] = useState('')
  const [dueDate, setDueDate] = useState(defaultDueDate(14))
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [error, setError] = useState('')

  const prodMap = {}
  for (const p of products) prodMap[p.id] = p

  useEffect(() => { loadBatches(); loadSuppliers() }, [])

  async function loadSuppliers() {
    try {
      const res = await window.api.suppliersGet(orgId)
      setSuppliers(res?.success ? res.data.filter(s => s.is_active !== false) : [])
    } catch {}
  }

  async function loadBatches() {
    try {
      // Group recent intake rows into batches, and attach each batch's bill
      // (amount owed/paid) when it came through the supplier-billed path.
      const [intakeRes, billsRes] = await Promise.all([
        window.api.stockIntakeGet(orgId),
        window.api.supplierBillsGet(orgId),
      ])
      const rows = intakeRes?.success ? intakeRes.data : []
      const billMap = {}
      for (const b of (billsRes?.success ? billsRes.data : [])) billMap[b.id] = b

      const groups = {}
      for (const r of (rows || [])) {
        const key = r.bill_id || r.batch_id || r.id  // records on the same bill are one batch; pre-bill/no-bill records each become their own group
        if (!groups[key]) groups[key] = { key, supplier: r.supplier, notes: r.notes, created_at: r.created_at, items: [], total: 0, units: 0, bill: r.bill_id ? billMap[r.bill_id] : null }
        groups[key].items.push(r)
        groups[key].total += Number(r.total_cost)
        groups[key].units += Number(r.quantity)
      }
      setBatches(Object.values(groups).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 12))
    } catch {}
  }

  function pickProduct(id) {
    const p = prodMap[id]
    setLine(l => ({ ...l, product_id: id, unit_cost: l.unit_cost || (p?.cost_price ? String(p.cost_price) : '') }))
  }

  const canAddLine = line.product_id && parseInt(line.quantity) > 0 && parseFloat(line.unit_cost) >= 0
    && !lines.some(l => l.product_id === line.product_id)

  function addLine() {
    if (!canAddLine) return
    const qty = parseInt(line.quantity)
    const cost = parseFloat(line.unit_cost)
    setLines(prev => [...prev, { product_id: line.product_id, quantity: qty, unit_cost: cost, total: qty * cost }])
    setLine({ product_id: '', quantity: '', unit_cost: '' })
  }

  function removeLine(pid) {
    setLines(prev => prev.filter(l => l.product_id !== pid))
  }

  const batchUnits = lines.reduce((s, l) => s + l.quantity, 0)
  const batchTotal = lines.reduce((s, l) => s + l.total, 0)

  async function commitBatch() {
    if (!lines.length) return
    setError('')
    const paid = parseFloat(amountPaid) || 0
    if (supplierId) {
      if (paid > batchTotal + 0.01) { setError('Amount paid cannot exceed the batch total'); return }
      if (batchTotal - paid > 0.01 && !dueDate) { setError('Due date is required unless paying in full'); return }
    }
    setSaving(true)
    try {
      let balanceInfo = null
      if (supplierId) {
        // A named supplier turns this batch into a real bill — amount owed, due
        // date, and any up-front payment all get tracked, same as Suppliers' New Bill.
        const res = await window.api.supplierBillCreate(orgId, {
          supplierId,
          lines: lines.map(l => ({ productId: l.product_id, quantity: l.quantity, unitCost: l.unit_cost })),
          dueDate, amountPaid: paid, paymentMethod, notes: reference, receivedBy: 'Admin',
        })
        if (!res?.success) throw new Error(res?.error || 'Failed to record bill')
        balanceInfo = { billNumber: res.bill_number, balance: res.balance }
      } else {
        // No supplier picked — a quick receive with no accounts-payable trail (e.g. opening stock).
        const res = await window.api.stockIntake(orgId, {
          lines: lines.map(l => ({ product_id: l.product_id, quantity: l.quantity, unit_cost: l.unit_cost })),
          notes: reference, received_by: 'Admin',
        })
        if (!res?.success) throw new Error(res?.error || 'Failed to record intake')
      }
      setSaved({ count: lines.length, units: batchUnits, total: batchTotal, ...balanceInfo })
      setLines([]); setSupplierId(''); setReference(''); setLine({ product_id: '', quantity: '', unit_cost: '' })
      setAmountPaid(''); setDueDate(defaultDueDate(14)); setPaymentMethod('cash')
      setTimeout(() => setSaved(null), 6000)
      loadBatches()
      onRefresh()
    } catch (e) {
      setError(e.message || 'Failed to commit batch')
      console.error('[Intake] commit failed', e)
    }
    setSaving(false)
  }

  const INP = {
    width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '9px 11px', fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'var(--font-ui)',
  }
  const LBL = { fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '.04em' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20, alignItems: 'start' }}>

      {/* Left: batch builder */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {saved && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, background: 'var(--ok-soft)', border: '1px solid rgba(5,150,105,0.3)', color: 'var(--ok-text)' }}>
            <Icon name="check" size={16} sw={2.5} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              Batch committed — {saved.count} product{saved.count !== 1 ? 's' : ''} · {saved.units} units · {rs(saved.total)} added.
              {saved.billNumber && (saved.balance > 0.01
                ? ` Bill ${saved.billNumber} — ${rs(saved.balance)} still owed to supplier.`
                : ` Bill ${saved.billNumber} — paid in full.`)}
            </span>
          </div>
        )}
        {error && (
          <div style={{ padding: '10px 16px', background: 'var(--bad-soft)', color: 'var(--bad-text)', fontSize: 13, borderRadius: 8, fontWeight: 600 }}>{error}</div>
        )}

        <Section title="New Stock Intake Batch" sub="One shipment, multiple products — add each line then commit the batch" icon="download">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LBL}>Supplier</label>
                <select style={INP} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                  <option value="">— Select supplier —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {!suppliers.length && (
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
                    No suppliers yet — add one under the Suppliers tab to track who this stock came from.
                  </div>
                )}
              </div>
              <div>
                <label style={LBL}>Reference / Notes</label>
                <input style={INP} placeholder="e.g. PO-2034, container #5" value={reference} onChange={e => setReference(e.target.value)} />
              </div>
            </div>

            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Add product to batch</div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                <div>
                  <label style={LBL}>Product</label>
                  <select style={INP} value={line.product_id} onChange={e => pickProduct(e.target.value)}>
                    <option value="">— Select —</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id} disabled={lines.some(l => l.product_id === p.id)}>
                        {p.name}{lines.some(l => l.product_id === p.id) ? ' (added)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={LBL}>Quantity</label>
                  <input style={{ ...INP, fontFamily: 'var(--font-mono)' }} type="number" min="1" placeholder="0" value={line.quantity} onChange={e => setLine(l => ({ ...l, quantity: e.target.value }))} />
                </div>
                <div>
                  <label style={LBL}>Unit Cost</label>
                  <input style={{ ...INP, fontFamily: 'var(--font-mono)' }} type="number" min="0" placeholder="0.00" value={line.unit_cost} onChange={e => setLine(l => ({ ...l, unit_cost: e.target.value }))} />
                </div>
                <button onClick={addLine} disabled={!canAddLine} style={{
                  padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', height: 38,
                  background: canAddLine ? 'var(--accent)' : 'var(--surface-3)', color: canAddLine ? '#fff' : 'var(--text-faint)',
                  cursor: canAddLine ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                }}>
                  <Icon name="plus" size={14} sw={2.5} /> Add
                </button>
              </div>
            </div>

            {/* Lines table */}
            {!lines.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 0', gap: 8, color: 'var(--text-faint)' }}>
                <Icon name="box" size={26} sw={1.5} />
                <span style={{ fontSize: 13 }}>No products added to this batch yet.</span>
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                      {['Product', 'Qty', 'Unit Cost', 'Total', ''].map((h, i) => (
                        <th key={i} style={{ textAlign: i >= 1 && i <= 3 ? 'right' : 'left', padding: '9px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(l => {
                      const p = prodMap[l.product_id]
                      return (
                        <tr key={l.product_id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text)' }}>{p?.name || l.product_id}</div>
                            <div style={{ marginTop: 2 }}><CatChip cat={p?.category} /></div>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text)' }}>{l.quantity}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{rs(l.unit_cost)}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text)' }}>{rs(l.total)}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            <button onClick={() => removeLine(l.product_id)} style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'var(--bad-soft)', color: 'var(--bad-text)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Icon name="x" size={11} sw={2.5} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <td colSpan={3} style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--text)' }}>Batch Total · {batchUnits} units</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 15, color: 'var(--accent-text)' }}>{rs(batchTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {supplierId && (
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Payment to supplier</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={LBL}>Amount Paid Now</label>
                    <input style={{ ...INP, fontFamily: 'var(--font-mono)' }} type="number" min="0" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <label style={LBL}>Due Date {batchTotal - (parseFloat(amountPaid) || 0) > 0.01 ? '*' : ''}</label>
                    <input style={{ ...INP, fontFamily: 'var(--font-mono)' }} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                  </div>
                  <div>
                    <label style={LBL}>Payment Method</label>
                    <select style={INP} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                      <option value="cash">Cash</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </div>
                </div>
                {batchTotal > 0 && (
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-dim)' }}>
                    Balance after this payment: <span style={{ fontWeight: 700, color: batchTotal - (parseFloat(amountPaid) || 0) > 0.01 ? 'var(--bad-text)' : 'var(--ok-text)' }}>
                      {rs(Math.max(0, batchTotal - (parseFloat(amountPaid) || 0)))}
                    </span>
                  </div>
                )}
              </div>
            )}

            <button onClick={commitBatch} disabled={!lines.length || saving} style={{
              padding: '11px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none',
              background: lines.length ? 'var(--ok)' : 'var(--surface-3)', color: lines.length ? '#fff' : 'var(--text-faint)',
              cursor: lines.length ? 'pointer' : 'not-allowed', opacity: saving ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <Icon name="check" size={15} sw={2.5} />
              {saving ? 'Committing…' : supplierId ? 'Commit Batch & Record Bill' : 'Commit Batch to Inventory'}
            </button>
          </div>
        </Section>
      </div>

      {/* Right: recent batches */}
      <Section title="Recent Batches" sub="Last 12 shipments" icon="list">
        {!batches.length ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)', textAlign: 'center', padding: '32px 0' }}>No batches yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {batches.map(b => (
              <div key={b.key} style={{ padding: 12, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.supplier || 'No supplier'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{b.created_at?.slice(0, 16)} · {b.items.length} item{b.items.length !== 1 ? 's' : ''} · {b.units} units</div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 13, color: 'var(--accent-text)', flexShrink: 0, marginLeft: 8 }}>{rs(b.total)}</span>
                </div>
                {b.bill && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <StatusBadge status={b.bill.payment_status} dueDate={b.bill.due_date} />
                    {(b.bill.total_amount - b.bill.amount_paid) > 0.01 && (
                      <span style={{ fontSize: 11, color: 'var(--bad-text)' }}>
                        {rs(b.bill.total_amount - b.bill.amount_paid)} owed{b.bill.due_date ? ` · due ${b.bill.due_date}` : ''}
                      </span>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {b.items.map((it, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{it.product_name}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-faint)', flexShrink: 0, marginLeft: 8 }}>×{it.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

// ─── Stock Ledger (Adjustments + Movement History) ─────────────────────────────

const ADJUSTMENT_REASONS = [
  { value: 'damaged',           label: 'Damaged' },
  { value: 'lost',               label: 'Lost / Theft' },
  { value: 'count_correction',   label: 'Count Correction' },
  { value: 'other',              label: 'Other' },
]

const MOVEMENT_LABELS = {
  intake: 'Stock Intake', sale: 'Sale', transfer_out: 'Sent to Distributor',
  transfer_in: 'Received from Main', return_in: 'Customer Return', replacement_out: 'Replacement Issued',
}
function movementLabel(type) {
  if (MOVEMENT_LABELS[type]) return MOVEMENT_LABELS[type]
  if (type === 'adjustment_sale_void') return 'Stock Restored — Sale Voided'
  if (type?.startsWith('adjustment_')) {
    const reason = type.replace('adjustment_', '')
    return `Adjustment — ${ADJUSTMENT_REASONS.find(r => r.value === reason)?.label || reason}`
  }
  return type
}

const MOVEMENT_META = {
  intake:          { icon: 'download',  color: '#10B981' },
  sale:            { icon: 'cart',      color: '#3B82F6' },
  transfer_out:    { icon: 'arrow-up',  color: '#F59E0B' },
  transfer_in:     { icon: 'arrow-down', color: '#10B981' },
  return_in:       { icon: 'arrow-down', color: '#14B8A6' },
  replacement_out: { icon: 'arrow-up',  color: '#F59E0B' },
}
function movementMeta(type) {
  if (MOVEMENT_META[type]) return MOVEMENT_META[type]
  if (type?.startsWith('adjustment_')) return { icon: 'edit', color: '#8B5CF6' }
  return { icon: 'ledger', color: '#6B7280' }
}

// A single record's full context, opened by clicking any row in the Stock
// Movement History table — the inline row only has room for a one-line summary.
function MovementDetailModal({ movement, productName, onClose }) {
  if (!movement) return null
  const meta = movementMeta(movement.movement_type)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 bg-[var(--surface-2)] border-b border-[var(--border)]">
          <div style={{ background: meta.color + '22', borderRadius: 10, width: 38, height: 38, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon name={meta.icon} size={17} sw={2} style={{ color: meta.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-[var(--text)]">{movementLabel(movement.movement_type)}</div>
            <div className="text-xs text-[var(--text-faint)] mono mt-0.5">{movement.created_at?.slice(0, 16).replace('T', ' ')}</div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg grid place-items-center flex-shrink-0" style={{ background: 'var(--surface-3)' }}>
            <Icon name="x" size={12} sw={2.4} style={{ color: 'var(--text-faint)' }} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-wider">Product</div>
              <div className="text-sm font-bold text-[var(--text)] mt-0.5">{productName}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-wider">Quantity</div>
              <div className="mono font-extrabold text-xl mt-0.5" style={{ color: movement.quantity_change >= 0 ? 'var(--ok-text)' : 'var(--bad-text)' }}>
                {movement.quantity_change >= 0 ? '+' : ''}{movement.quantity_change}
              </div>
            </div>
          </div>
          {movement.reference && (
            <div>
              <div className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-wider">Reference</div>
              <div className="text-sm text-[var(--text-dim)] mt-0.5">{movement.reference}</div>
            </div>
          )}
          {movement.notes && (
            <div>
              <div className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-wider">Notes</div>
              <div className="text-sm text-[var(--text-dim)] mt-0.5">{movement.notes}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LedgerView({ products, orgId, currentUser, onRefresh }) {
  const [productId, setProductId]     = useState('')
  const [qty, setQty]                 = useState('')
  const [reason, setReason]           = useState('count_correction')
  const [notes, setNotes]             = useState('')
  const [saving, setSaving]           = useState(false)
  const [rows, setRows]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [filterProduct, setFilterProduct] = useState('')
  const [selectedMove, setSelectedMove] = useState(null)

  const prodMap = {}
  for (const p of products) prodMap[p.id] = p

  const loadLedger = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.api.stockLedgerGet(orgId, filterProduct || null)
      setRows(res?.success ? res.data : [])
    } catch {}
    setLoading(false)
  }, [orgId, filterProduct])

  useEffect(() => { loadLedger() }, [loadLedger])

  const canSubmit = productId && parseInt(qty) && !isNaN(parseInt(qty))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    try {
      const res = await window.api.stockAdjustmentCreate(orgId, {
        productId, quantityChange: parseInt(qty), reason, notes,
        createdBy: currentUser?.name || currentUser?.email || '',
      })
      if (!res.success) throw new Error(res.error)
      toast.success('Stock adjustment applied')
      setProductId(''); setQty(''); setReason('count_correction'); setNotes('')
      loadLedger()
      onRefresh?.()
    } catch (err) {
      toast.error(err.message || 'Failed to apply adjustment')
    }
    setSaving(false)
  }

  const INP = {
    width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '9px 11px', fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'var(--font-ui)',
  }
  const LBL = { fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '.04em' }

  return (
    <div className="flex flex-col gap-5">
      <MovementDetailModal movement={selectedMove} productName={selectedMove ? (prodMap[selectedMove.product_id]?.name || selectedMove.product_id) : ''} onClose={() => setSelectedMove(null)} />

      <Section title="New Stock Adjustment" sub="Manually correct quantity on hand — damage, loss, or a physical count difference" icon="edit">
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.4fr 2fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <label style={LBL}>Product</label>
            <select style={INP} value={productId} onChange={e => setProductId(e.target.value)}>
              <option value="">— Select —</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} (on hand: {p.qty_on_hand ?? 0})</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>Qty (+/-)</label>
            <input style={{ ...INP, fontFamily: 'var(--font-mono)' }} type="number" placeholder="-1" value={qty} onChange={e => setQty(e.target.value)} />
          </div>
          <div>
            <label style={LBL}>Reason</label>
            <select style={INP} value={reason} onChange={e => setReason(e.target.value)}>
              {ADJUSTMENT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>Notes</label>
            <input style={INP} placeholder="Optional" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <button type="submit" disabled={!canSubmit || saving} style={{
            padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', height: 38,
            background: canSubmit ? 'var(--accent)' : 'var(--surface-3)', color: canSubmit ? '#fff' : 'var(--text-faint)',
            cursor: canSubmit ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
          }}>
            {saving ? 'Saving…' : 'Apply'}
          </button>
        </form>
      </Section>

      <Section title="Stock Movement History" sub="Every unit in and out — intake, sales, transfers, returns, adjustments" icon="ledger"
        action={
          <select style={{ ...INP, width: 200 }} value={filterProduct} onChange={e => setFilterProduct(e.target.value)}>
            <option value="">All products</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        }>
        <DataTable loading={loading} emptyMsg="No stock movements yet" rows={rows} onRowClick={setSelectedMove}
          cols={[
            { label: 'Date', render: r => <span className="text-xs mono text-[var(--text-faint)]">{r.created_at?.slice(0, 16).replace('T', ' ')}</span> },
            { label: 'Product', render: r => <span className="font-semibold text-sm text-[var(--text)]">{prodMap[r.product_id]?.name || r.product_id}</span> },
            { label: 'Movement', render: r => {
              const meta = movementMeta(r.movement_type)
              return (
                <span className="inline-flex items-center gap-2">
                  <span style={{ background: meta.color + '22', borderRadius: 6, width: 22, height: 22, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon name={meta.icon} size={11} sw={2.2} style={{ color: meta.color }} />
                  </span>
                  <span className="text-xs font-semibold text-[var(--text-dim)]">{movementLabel(r.movement_type)}</span>
                </span>
              )
            }},
            { label: 'Qty', render: r => (
              <span className="mono font-bold text-sm" style={{ color: r.quantity_change >= 0 ? 'var(--ok-text)' : 'var(--bad-text)' }}>
                {r.quantity_change >= 0 ? '+' : ''}{r.quantity_change}
              </span>
            )},
            { label: 'Reference', render: r => <span className="text-xs text-[var(--text-faint)]">{r.reference}{r.notes ? ` · ${r.notes}` : ''}</span> },
          ]}
        />
      </Section>
    </div>
  )
}

// ─── Batch History (per-product incoming-stock traceability) ──────────────────

function BatchHistoryView({ products, orgId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api.stockIntakeGet(orgId, 2000)
      .then(res => { if (!cancelled) setRows(res?.success ? res.data : []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [orgId])

  const prodMap = {}
  for (const p of products) prodMap[p.id] = p

  // Roll every intake row up into a per-product summary
  const summaries = Object.values(rows.reduce((acc, r) => {
    if (!acc[r.product_id]) {
      acc[r.product_id] = {
        product_id: r.product_id, product_name: r.product_name, category: r.category, brand: r.brand,
        batchCount: 0, totalQty: 0, totalCost: 0, lastReceivedAt: null,
      }
    }
    const s = acc[r.product_id]
    s.batchCount += 1
    s.totalQty += Number(r.quantity) || 0
    s.totalCost += Number(r.total_cost) || 0
    if (!s.lastReceivedAt || r.created_at > s.lastReceivedAt) s.lastReceivedAt = r.created_at
    return acc
  }, {})).sort((a, b) => (b.lastReceivedAt || '').localeCompare(a.lastReceivedAt || ''))

  const filteredSummaries = summaries.filter(s => {
    const q = search.toLowerCase()
    return !q || s.product_name?.toLowerCase().includes(q) || s.category?.toLowerCase().includes(q) || s.brand?.toLowerCase().includes(q)
  })

  // ─── Drill-down: one product's full batch history ───────────────────────────
  if (selectedId) {
    const summary = summaries.find(s => s.product_id === selectedId)
    const product = prodMap[selectedId]
    const batches = rows.filter(r => r.product_id === selectedId)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    const avgCost = summary?.totalQty > 0 ? summary.totalCost / summary.totalQty : 0

    return (
      <div className="flex flex-col gap-5">
        <button onClick={() => setSelectedId(null)}
          className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
          <Icon name="arrow" size={13} sw={2} style={{ transform: 'rotate(180deg)' }} /> Back to All Products
        </button>

        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-soft)' }}>
            {product?.image_path
              ? <img src={product.image_path} alt="" className="w-11 h-11 rounded-xl object-cover" />
              : <Icon name="box" size={18} sw={1.8} style={{ color: 'var(--accent)' }} />}
          </div>
          <div>
            <div className="text-lg font-extrabold text-[var(--text)]">{summary?.product_name || 'Unknown Product'}</div>
            <div className="flex items-center gap-2 mt-0.5">
              {summary?.category && <CatChip cat={summary.category} />}
              {summary?.brand && <span className="text-xs text-[var(--text-faint)]">{summary.brand}</span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard label="Current Stock"        value={product?.qty_on_hand ?? 0}        icon="box"    color="teal"    />
          <KpiCard label="Total Batches"         value={summary?.batchCount ?? 0}         icon="list"   color="blue"    />
          <KpiCard label="Units Received (All-Time)" value={summary?.totalQty ?? 0}        icon="download" color="emerald" />
          <KpiCard label="Total Cost Invested"   value={rs(summary?.totalCost)}           icon="cash"   color="amber"   />
          <KpiCard label="Avg. Unit Cost"        value={rs(avgCost)}                      icon="chart"  color="blue"    />
        </div>

        <Section title={`Batch History (${batches.length})`} sub="Every delivery received for this product, most recent first" icon="clock">
          <DataTable loading={loading} emptyMsg="No batches recorded for this product yet." rows={batches}
            cols={[
              { label: 'Date', render: r => <span className="text-xs mono text-[var(--text-dim)]">{r.created_at?.slice(0, 16).replace('T', ' ')}</span> },
              { label: 'Supplier', render: r => <span className="text-sm font-semibold text-[var(--text)]">{r.supplier || '—'}</span> },
              { label: 'Quantity', render: r => <span className="mono font-bold text-sm" style={{ color: 'var(--ok-text)' }}>+{r.quantity}</span> },
              { label: 'Unit Cost', render: r => <span className="mono text-sm text-[var(--text-dim)]">{rs(r.unit_cost)}</span> },
              { label: 'Total Cost', render: r => <span className="mono font-bold text-sm text-[var(--text)]">{rs(r.total_cost)}</span> },
              { label: 'Received By', render: r => <span className="text-xs text-[var(--text-faint)]">{r.received_by || '—'}</span> },
              { label: 'Reference', render: r => <span className="text-xs text-[var(--text-faint)]">{r.notes || '—'}</span> },
            ]}
          />
        </Section>
      </div>
    )
  }

  // ─── List: every product with stock-in history, most recently restocked first ─
  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-sm">
        <Icon name="search" size={14} sw={2} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
        <input className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-8 pr-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
          placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Section title={`Products with Stock History (${filteredSummaries.length})`} sub="Click a product to see its full batch-by-batch delivery history" icon="clock">
        <DataTable loading={loading} emptyMsg="No stock has been received yet — use Stock Intake to record a delivery." rows={filteredSummaries}
          onRowClick={r => setSelectedId(r.product_id)}
          cols={[
            { label: 'Product', render: r => (
              <div>
                <div className="font-semibold text-[var(--text)] text-sm">{r.product_name}</div>
                {r.brand && <div className="text-xs text-[var(--text-faint)] mt-0.5">{r.brand}</div>}
              </div>
            )},
            { label: 'Category', render: r => <CatChip cat={r.category} /> },
            { label: 'Current Stock', render: r => {
              const p = prodMap[r.product_id]
              return <span className="mono font-bold text-sm" style={{ color: (p?.qty_on_hand ?? 0) <= (p?.reorder_level || 5) ? 'var(--bad-text)' : 'var(--ok-text)' }}>{p?.qty_on_hand ?? '—'}</span>
            }},
            { label: 'Batches', render: r => <span className="mono text-sm text-[var(--text-dim)]">{r.batchCount}</span> },
            { label: 'Total Received', render: r => <span className="mono text-sm text-[var(--text-dim)]">{r.totalQty} units</span> },
            { label: 'Total Cost', render: r => <span className="mono font-semibold text-sm text-[var(--text)]">{rs(r.totalCost)}</span> },
            { label: 'Last Received', render: r => <span className="text-xs text-[var(--text-faint)] mono">{r.lastReceivedAt?.slice(0, 16).replace('T', ' ') || '—'}</span> },
            { label: '', render: r => <Icon name="chev" size={13} sw={2} style={{ color: 'var(--text-faint)', transform: 'rotate(-90deg)' }} /> },
          ]}
        />
      </Section>
    </div>
  )
}

// ─── Activity Feed (network-wide, or drilled into one branch) ─────────────────

const ACTIVITY_META = {
  sale:             { label: 'Sale',              icon: 'cart',     color: 'var(--accent-text)' },
  payment:          { label: 'Payment',           icon: 'cash',     color: 'var(--ok-text)'     },
  intake:           { label: 'Stock Intake',      icon: 'download', color: 'var(--accent-text)' },
  adjustment:       { label: 'Stock Adjustment',  icon: 'edit',     color: 'var(--warn-text)'   },
  supply_sent:      { label: 'Shipment Sent',     icon: 'arrow',    color: 'var(--accent-text)' },
  supply_received:  { label: 'Shipment Received', icon: 'check',    color: 'var(--ok-text)'     },
  payment_claim:    { label: 'Payment Claim',     icon: 'alert',    color: 'var(--warn-text)'   },
  return:           { label: 'Return / Replace',  icon: 'arrow-up', color: 'var(--bad-text)'    },
  warranty:         { label: 'Warranty Claim',    icon: 'shield',   color: 'var(--warn-text)'   },
  staff_added:      { label: 'New Staff',         icon: 'users',    color: 'var(--accent-text)' },
  product_added:    { label: 'Product Added',     icon: 'box',      color: 'var(--accent-text)' },
}

function ActivityBadge({ type }) {
  const m = ACTIVITY_META[type] || { label: type, icon: 'info', color: 'var(--text-dim)' }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: m.color + '18', color: m.color }}>
      <Icon name={m.icon} size={11} sw={2.5} />
      {m.label}
    </span>
  )
}

function ActivityFeedView() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [orgFilter, setOrgFilter] = useState('all')
  const [distributors, setDistributors] = useState([])
  const isFirstLoad = useRef(true) // only the initial load should show the loading state — background polls refresh silently so the list doesn't flicker every 30s

  useEffect(() => {
    window.api.distributorsGet().then(r => { if (r.success) setDistributors(r.data) }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true)
    try {
      const res = await window.api.activityFeedGet(orgFilter === 'all' ? null : orgFilter, 150)
      setRows(res?.success ? res.data : [])
    } catch {}
    if (isFirstLoad.current) { setLoading(false); isFirstLoad.current = false }
  }, [orgFilter])

  useEffect(() => { load() }, [load])

  // Poll so activity from a branch's own POS app shows up without a manual refresh.
  useEffect(() => {
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load])

  const inp = 'bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] transition-all'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-wider">Branch</label>
          <select className={inp + ' min-w-48'} value={orgFilter} onChange={e => setOrgFilter(e.target.value)}>
            <option value="all">All Branches (network-wide)</option>
            <option value="org_main_company">Sameer Battery House (Main)</option>
            {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <button onClick={load} className="self-end flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
          <Icon name="arrow" size={12} sw={2} style={{ transform: 'rotate(90deg)' }} /> Refresh
        </button>
      </div>

      <Section title={`Recent Activity (${rows.length})`} sub={orgFilter === 'all' ? 'Every branch, most recent first' : 'This branch only, most recent first'} icon="lightning">
        <DataTable loading={loading} emptyMsg="No activity yet." rows={rows}
          cols={[
            { label: 'Time', render: r => <span className="text-xs mono text-[var(--text-faint)] whitespace-nowrap">{r.created_at?.slice(0, 16).replace('T', ' ')}</span> },
            { label: 'Branch', render: r => <span className="text-xs font-semibold text-[var(--text-dim)]">{r.org_name}</span> },
            { label: 'Type', render: r => <ActivityBadge type={r.activity_type} /> },
            { label: 'Details', render: r => <span className="text-sm text-[var(--text)]">{r.description}</span> },
            { label: 'By', render: r => <span className="text-xs text-[var(--text-faint)]">{r.actor || '—'}</span> },
            { label: 'Amount', render: r => r.amount != null ? <span className="mono font-semibold text-sm text-[var(--text)]">{rs(r.amount)}</span> : <span className="text-xs text-[var(--text-faint)]">—</span> },
          ]}
        />
      </Section>
    </div>
  )
}

// ─── Invoice Detail Modal ─────────────────────────────────────────────────────

function InvoiceModal({ invoice, onClose, onVoided }) {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [voiding, setVoiding] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voidBusy, setVoidBusy] = useState(false)
  const [printing, setPrinting] = useState(false)
  // The receipt prints with the branch that made the sale (its name, phones,
  // footer), not the main company's, so a distributor's bill looks like theirs.
  const [branchSettings, setBranchSettings] = useState({})

  useEffect(() => {
    if (!invoice) return
    window.api.salesItemsGet(invoice.id)
      .then(r => setItems(r?.success ? r.data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
    window.api.orgSettingsGet(invoice.org_id)
      .then(r => { if (r?.success) setBranchSettings(r.data) })
      .catch(() => {})
  }, [invoice?.id])

  if (!invoice) return null

  async function handleVoid() {
    if (!voidReason.trim()) { toast.error('A reason is required'); return }
    setVoidBusy(true)
    try {
      const res = await window.api.salesVoid(invoice.id, voidReason.trim(), user?.name || user?.email || '')
      if (!res?.success) throw new Error(res?.error || 'Failed to void invoice')
      toast.success(`${invoice.invoice_number} voided — stock restored`)
      onVoided?.()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to void invoice')
    }
    setVoidBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
        style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-2)] flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <div className="mono font-bold text-[var(--accent-text)] text-sm tracking-wide">{invoice.invoice_number}</div>
              {invoice.is_voided && (
                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'var(--bad-soft)', color: 'var(--bad-text)' }}>VOIDED</span>
              )}
            </div>
            <div className="text-xs text-[var(--text-faint)] mt-0.5">{invoice.org_name || invoice.org_id} · {fmtDateTime(invoice.local_created_at)}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPrinting(true)} disabled={loading}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 text-white"
              style={{ background: 'var(--accent)', opacity: loading ? 0.6 : 1 }}>
              <Icon name="doc" size={12} sw={2.2} /> Print Receipt
            </button>
            {!invoice.is_voided && !voiding && (
              <button onClick={() => setVoiding(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--bad-soft)', color: 'var(--bad-text)', border: '1px solid var(--bad)' }}>
                Void Sale
              </button>
            )}
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-[var(--text-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]">
              <Icon name="x" size={14} sw={2.2} />
            </button>
          </div>
        </div>

        {/* Void reason prompt */}
        {voiding && (
          <div className="px-6 py-4 border-b border-[var(--border)] flex-shrink-0" style={{ background: 'var(--bad-soft)' }}>
            <div className="text-xs font-bold mb-2" style={{ color: 'var(--bad-text)' }}>
              This cancels the sale and restores {items.length ? `${items.reduce((s, i) => s + i.quantity, 0)} unit(s)` : 'the sold stock'} back to inventory. This cannot be undone.
            </div>
            <textarea autoFocus rows={2} value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Reason for voiding this sale (required)…"
              className="w-full text-sm rounded-lg px-3 py-2 outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--bad)', color: 'var(--text)' }} />
            <div className="flex gap-2 mt-2">
              <button onClick={handleVoid} disabled={voidBusy || !voidReason.trim()}
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: 'var(--bad)', opacity: voidBusy || !voidReason.trim() ? 0.6 : 1 }}>
                {voidBusy ? 'Voiding…' : 'Confirm Void'}
              </button>
              <button onClick={() => { setVoiding(false); setVoidReason('') }} className="px-4 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-dim)] bg-[var(--surface)] border border-[var(--border)]">
                Cancel
              </button>
            </div>
          </div>
        )}

        {invoice.is_voided && (
          <div className="px-6 py-3 border-b border-[var(--border)] flex-shrink-0 text-xs" style={{ background: 'var(--bad-soft)', color: 'var(--bad-text)' }}>
            Voided {invoice.voided_at?.slice(0, 16).replace('T', ' ')}{invoice.voided_by ? ` by ${invoice.voided_by}` : ''}{invoice.void_reason ? ` — ${invoice.void_reason}` : ''}
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 flex flex-col gap-5">
          {/* Customer info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-4">
              <div className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider mb-2">Customer</div>
              <div className="font-bold text-[var(--text)]">{invoice.customer_name}</div>
              {invoice.customer_phone   && <div className="text-xs text-[var(--text-dim)] mt-1 flex items-center gap-1.5"><Icon name="phone" size={11} sw={2} />{invoice.customer_phone}</div>}
              {invoice.customer_address && <div className="text-xs text-[var(--text-faint)] mt-0.5">{invoice.customer_address}</div>}
            </div>
            <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-4">
              <div className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider mb-2">Invoice Info</div>
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--text-faint)]">Branch</span>
                  <span className="font-semibold text-[var(--text)]">{invoice.org_name || invoice.org_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-faint)]">Type</span>
                  <span className="font-semibold text-[var(--text)] capitalize">{invoice.sale_type || 'retail'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-faint)]">Status</span>
                  <StatusBadge status={invoice.payment_status} dueDate={invoice.due_date} />
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-faint)]">Date</span>
                  <span className="mono text-[var(--text)]">{fmtDateTime(invoice.local_created_at)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider mb-3">Items Purchased</div>
            {loading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : (
              <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider">Product</th>
                      <th className="text-right py-2.5 px-4 text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider">Unit Price</th>
                      <th className="text-right py-2.5 px-4 text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider">Qty</th>
                      <th className="text-right py-2.5 px-4 text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {items.map((it, i) => (
                      <tr key={i} className="hover:bg-[var(--surface-2)] transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[var(--text)]">{it.product_name}</div>
                          {it.brand && <div className="text-xs text-[var(--text-faint)]">{it.brand}</div>}
                        </td>
                        <td className="py-3 px-4 text-right mono text-sm text-[var(--text-dim)]">{rs(it.unit_price)}</td>
                        <td className="py-3 px-4 text-right mono font-semibold text-sm text-[var(--text)]">×{it.quantity}</td>
                        <td className="py-3 px-4 text-right mono font-bold text-sm text-[var(--accent-text)]">{rs(it.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-2)]">
                      <td colSpan={3} className="py-3 px-4 text-right text-sm font-bold text-[var(--text)]">Grand Total</td>
                      <td className="py-3 px-4 text-right mono font-extrabold text-base text-[var(--accent-text)]">{rs(invoice.final_amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {printing && (
        <ReceiptModal invoice={{ ...invoice, created_at: invoice.local_created_at }} items={items}
          products={[]} orgSettings={branchSettings} onClose={() => setPrinting(false)} />
      )}
    </div>
  )
}

// ─── Sales ────────────────────────────────────────────────────────────────────

function SalesView() {
  const [sales, setSales]         = useState([])
  const [fetching, setFetch]      = useState(true)
  const [orgs, setOrgs]           = useState([])
  const [search, setSearch]       = useState('')
  const [orgFilter, setOrgFilter] = useState('all')
  const [cashierFilter, setCashierFilter] = useState('all')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [selected, setSelected]   = useState(null)

  const load = useCallback(async () => {
    setFetch(true)
    try {
      // All invoices across all orgs, joined with org name
      const res = await window.api.salesGetAllWithOrgNames()
      const rows = res?.success ? res.data : []
      setSales(rows)

      // Distinct orgs that have sales, derived client-side from the same rows
      const seen = new Map()
      for (const r of rows) if (!seen.has(r.org_id)) seen.set(r.org_id, r.org_name)
      setOrgs([...seen.entries()].map(([org_id, name]) => ({ org_id, name })).sort((a, b) => (a.name || '').localeCompare(b.name || '')))
    } catch {}
    setFetch(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Distinct cashiers (created_by) that have sales, derived client-side from the same rows.
  const cashiers = [...new Set(sales.map(s => s.created_by).filter(Boolean))].sort()

  const inp = 'bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] transition-all placeholder:text-[var(--text-faint)]'

  const filtered = sales.filter(s => {
    const q = search.toLowerCase()
    const matchQ = !q || s.invoice_number?.toLowerCase().includes(q)
      || s.customer_name?.toLowerCase().includes(q)
      || s.customer_phone?.includes(q)
      || s.org_name?.toLowerCase().includes(q)
      || s.created_by?.toLowerCase().includes(q)
    const matchOrg     = orgFilter === 'all' || s.org_id === orgFilter
    const matchCashier = cashierFilter === 'all' || s.created_by === cashierFilter
    const matchFrom = !dateFrom || s.local_created_at >= dateFrom
    const matchTo   = !dateTo   || s.local_created_at <= dateTo + ' 23:59:59'
    return matchQ && matchOrg && matchCashier && matchFrom && matchTo
  })

  // Voided sales stay visible in the list for audit purposes but never count
  // toward totals/summaries.
  const totalFiltered = filtered.reduce((s, r) => s + (r.is_voided ? 0 : Number(r.final_amount)), 0)

  function handleExport() {
    exportToExcel(`sales-history-${new Date().toISOString().slice(0, 10)}.xlsx`, filtered.map(s => ({
      'Invoice #': s.invoice_number, 'Branch': s.org_name, 'Customer': s.customer_name, 'Phone': s.customer_phone,
      'Type': s.sale_type, 'Amount': s.final_amount, 'Paid': s.amount_paid, 'Status': s.is_voided ? 'Voided' : s.payment_status,
      'Cashier': s.created_by, 'Date': s.local_created_at?.slice(0, 16).replace('T', ' '),
    })))
  }

  // Per-cashier summary for whatever's currently filtered — "sales by cashier"
  const byCashier = Object.values(filtered.reduce((acc, s) => {
    if (s.is_voided) return acc
    const key = s.created_by || 'Unassigned'
    if (!acc[key]) acc[key] = { name: key, count: 0, total: 0 }
    acc[key].count += 1
    acc[key].total += Number(s.final_amount) || 0
    return acc
  }, {})).sort((a, b) => b.total - a.total)

  return (
    <>
      {selected && <InvoiceModal invoice={selected} onClose={() => setSelected(null)} onVoided={load} />}

      <div className="flex flex-col gap-4">
        {/* Filters bar */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="relative flex-1 min-w-52">
            <Icon name="search" size={14} sw={2} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
            <input className={inp + ' w-full pl-8'} placeholder="Invoice #, customer name, phone…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Branch filter */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-wider">Branch</label>
            <select className={inp + ' min-w-40'} value={orgFilter} onChange={e => setOrgFilter(e.target.value)}>
              <option value="all">All branches</option>
              {orgs.map(o => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
            </select>
          </div>

          {/* Cashier filter */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-wider">Cashier</label>
            <select className={inp + ' min-w-40'} value={cashierFilter} onChange={e => setCashierFilter(e.target.value)}>
              <option value="all">All cashiers</option>
              {cashiers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Date from */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-wider">From</label>
            <input type="date" className={inp + ' mono'} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>

          {/* Date to */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-wider">To</label>
            <input type="date" className={inp + ' mono'} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>

          {/* Clear */}
          {(search || orgFilter !== 'all' || cashierFilter !== 'all' || dateFrom || dateTo) && (
            <button onClick={() => { setSearch(''); setOrgFilter('all'); setCashierFilter('all'); setDateFrom(''); setDateTo('') }}
              className="px-3 py-2 rounded-lg text-xs font-semibold text-[var(--bad-text)] border border-[var(--bad-soft)] bg-[var(--bad-soft)] hover:bg-[var(--bad-soft)]/70 transition-colors">
              Clear filters
            </button>
          )}
        </div>

        {/* By-cashier summary for the current filter set */}
        {byCashier.length > 0 && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-xs font-bold text-[var(--text-faint)] uppercase tracking-wider mb-3">Sales by Cashier</div>
            <div className="flex flex-wrap gap-2">
              {byCashier.map(c => (
                <button key={c.name} onClick={() => setCashierFilter(cashierFilter === c.name ? 'all' : c.name)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors"
                  style={{ background: cashierFilter === c.name ? 'var(--accent-soft)' : 'var(--surface-2)', border: `1px solid ${cashierFilter === c.name ? 'var(--accent)' : 'var(--border)'}` }}>
                  <span className="font-semibold" style={{ color: cashierFilter === c.name ? 'var(--accent-text)' : 'var(--text)' }}>{c.name}</span>
                  <span className="text-[var(--text-faint)]">{c.count} sale{c.count !== 1 ? 's' : ''}</span>
                  <span className="mono font-bold" style={{ color: 'var(--ok-text)' }}>{rs(c.total)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Summary strip */}
        <div className="flex items-center gap-6 px-1">
          <div className="text-sm text-[var(--text-dim)]">
            <span className="font-bold text-[var(--text)]">{filtered.length}</span> invoice{filtered.length !== 1 ? 's' : ''}
          </div>
          <div className="text-sm text-[var(--text-dim)]">
            Total: <span className="mono font-bold text-[var(--accent-text)]">{rs(totalFiltered)}</span>
          </div>
          <button onClick={handleExport} disabled={!filtered.length}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: filtered.length ? 'var(--text-dim)' : 'var(--text-faint)', cursor: filtered.length ? 'pointer' : 'not-allowed' }}>
            <Icon name="download" size={12} sw={2} /> Export to Excel
          </button>
          <div className="text-xs text-[var(--text-faint)]">Click any row to view full invoice</div>
        </div>

        {/* Table */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2.5 px-5 py-3.5 bg-[var(--surface-2)] border-b border-[var(--border)]">
            <Icon name="list" size={14} sw={2} style={{ color: 'var(--accent)' }} />
            <div className="text-sm font-bold text-[var(--text)]">All Branches — Sales Invoices</div>
            <span className="ml-auto text-xs text-[var(--text-faint)]">Latest 500 · all orgs</span>
          </div>

          {fetching ? (
            <div className="flex justify-center py-14"><Spinner /></div>
          ) : !filtered.length ? (
            <div className="flex flex-col items-center py-14 gap-3 text-[var(--text-faint)]">
              <Icon name="list" size={30} sw={1.5} />
              <span className="text-sm">No invoices match the current filters</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    {['Invoice #', 'Branch', 'Cashier', 'Customer', 'Amount', 'Type', 'Status', 'Date', ''].map((h, i) => (
                      <th key={i} className="text-left py-2.5 px-4 text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider first:pl-5 last:pr-5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filtered.map((s, i) => (
                    <tr key={i}
                      onClick={() => setSelected(s)}
                      className="hover:bg-[var(--accent-soft)]/40 transition-colors cursor-pointer group"
                      style={s.is_voided ? { opacity: 0.55 } : undefined}>
                      <td className="py-3 px-4 pl-5 mono font-semibold text-[var(--accent-text)] text-xs">{s.invoice_number}</td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--surface-3)] text-[var(--text-dim)]">
                          {s.org_name || s.org_id}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--text-dim)]">{s.created_by || '—'}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[var(--text)]">{s.customer_name}</div>
                        {s.customer_phone && <div className="text-xs text-[var(--text-faint)]">{s.customer_phone}</div>}
                      </td>
                      <td className="py-3 px-4 mono font-bold text-[var(--text)]" style={s.is_voided ? { textDecoration: 'line-through' } : undefined}>{rs(s.final_amount)}</td>
                      <td className="py-3 px-4 text-xs text-[var(--text-dim)] capitalize">{s.sale_type || 'retail'}</td>
                      <td className="py-3 px-4">
                        {s.is_voided
                          ? <span className="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'var(--bad-soft)', color: 'var(--bad-text)' }}>Voided</span>
                          : <StatusBadge status={s.payment_status} dueDate={s.due_date} />}
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--text-faint)] mono">{s.local_created_at?.slice(0, 16)}</td>
                      <td className="py-3 px-4 pr-5 text-[var(--text-faint)] group-hover:text-[var(--accent)] transition-colors">
                        <Icon name="chev" size={14} sw={2} style={{ transform: 'rotate(-90deg)' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Staff ────────────────────────────────────────────────────────────────────

function SetPasswordModal({ target, onClose, onSaved }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setSaving(true)
    try {
      const res = await window.api.staffSetPassword(target.id, target.auth_id, password)
      if (!res?.success) throw new Error(res?.error || 'Failed to set password')
      toast.success(`Password updated for ${target.name}`)
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <form onSubmit={handleSubmit} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-[var(--surface-2)] border-b border-[var(--border)]">
          <div>
            <div className="font-bold text-[var(--text)] text-sm">Set New Password</div>
            <div className="text-xs text-[var(--text-faint)] mt-0.5">{target.name} · {target.email}</div>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: 'var(--surface-3)' }}>
            <Icon name="x" size={12} sw={2.4} style={{ color: 'var(--text-faint)' }} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-[var(--text-faint)] mb-1.5 block">New Password</label>
            <input type="password" autoFocus className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-faint)] mb-1.5 block">Confirm Password</label>
            <input type="password" className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-type password" />
          </div>
          {error && <div className="text-xs text-[var(--bad-text)] font-semibold">{error}</div>}
          <button type="submit" disabled={saving} className="w-full py-2.5 rounded-lg text-sm font-bold text-white" style={{ background: 'var(--accent)', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Set Password'}
          </button>
        </div>
      </form>
    </div>
  )
}

function EditUserModal({ target, onClose, onSaved }) {
  const [name, setName]   = useState(target.name || '')
  const [email, setEmail] = useState(target.email || '')
  const [phone, setPhone] = useState(target.phone || '')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!name.trim() || !email.trim()) { setError('Name and email are required'); return }
    setSaving(true)
    try {
      const res = await window.api.staffUpdateProfile(target.id, target.auth_id, {
        name: name.trim(), phone: phone.trim(), email: email.trim(),
      })
      if (!res?.success) throw new Error(res?.error || 'Failed to update user')
      toast.success(`${name.trim()} updated`)
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <form onSubmit={handleSubmit} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-[var(--surface-2)] border-b border-[var(--border)]">
          <div className="font-bold text-[var(--text)] text-sm">Edit User</div>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: 'var(--surface-3)' }}>
            <Icon name="x" size={12} sw={2.4} style={{ color: 'var(--text-faint)' }} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-[var(--text-faint)] mb-1.5 block">Full Name</label>
            <input autoFocus className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ali Hassan" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-faint)] mb-1.5 block">Email (also their login)</label>
            <input type="email" className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              value={email} onChange={e => setEmail(e.target.value)} placeholder="ali@example.com" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-faint)] mb-1.5 block">Phone Number</label>
            <input className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              value={phone} onChange={e => setPhone(e.target.value)} placeholder="0300-1234567" />
          </div>
          {error && <div className="text-xs text-[var(--bad-text)] font-semibold">{error}</div>}
          <button type="submit" disabled={saving} className="w-full py-2.5 rounded-lg text-sm font-bold text-white" style={{ background: 'var(--accent)', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

function StaffView() {
  const { user: currentUser }     = useAuth()
  const [staff, setStaff]         = useState([])
  const [orgs, setOrgs]           = useState([])
  const [loading, setLoad]        = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState({ name: '', email: '', password: '', role: 'sales_user', org_id: '' })
  const [err, setErr]             = useState('')
  const [passwordTarget, setPasswordTarget] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const roleLabel = { super_admin: 'Super Admin', distributor_user: 'Distributor Staff', sales_user: 'Salesman / Cashier' }
  const roleColor = { super_admin: '#14B8A6', distributor_user: '#3B82F6', sales_user: '#10B981' }
  const roleDesc  = {
    super_admin:      'Full access — all branches, products, reports, staff. Only one needed. Signs in here, on the website.',
    distributor_user: 'Distributor branch account — full access to that branch\'s POS, inventory, sales, and staff (no separate admin/cashier split). Signs in through the POS app.',
    sales_user:       'Main-branch counter salesman — creates invoices on POS, manages stock intake, views their own sales. Signs in through the POS app.',
  }

  function load() {
    Promise.all([
      window.api.staffGetAllWithOrgNames(),
      window.api.orgsGetAll(),
    ]).then(([usersRes, orgsRes]) => {
      setStaff(usersRes?.success ? usersRes.data : [])
      setOrgs(orgsRes?.success ? orgsRes.data : [])
    }).catch(() => {}).finally(() => setLoad(false))
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e) {
    e.preventDefault()
    setErr('')
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setErr('Name, email and password are required')
      return
    }
    if (form.role !== 'super_admin' && !form.org_id) {
      setErr('Please select a branch/organisation for this user')
      return
    }
    setSaving(true)
    try {
      const res = await window.api.authRegister(
        form.email.trim(),
        form.password,
        form.role,
        form.name.trim(),
        form.role === 'super_admin' ? null : form.org_id
      )
      if (!res.success) throw new Error(res.error)
      setShowAdd(false)
      setForm({ name: '', email: '', password: '', role: 'sales_user', org_id: '' })
      load()
    } catch (e) { setErr(e.message) }
    setSaving(false)
  }

  async function toggleActive(u) {
    await window.api.staffSetActive(u.id, !u.is_active)
    load()
  }

  async function handleDelete(u) {
    if (!window.confirm(`Permanently delete ${u.name} (${u.email})? This removes their login entirely and cannot be undone.`)) return
    setDeletingId(u.id)
    try {
      const res = await window.api.staffDelete(u.id, u.auth_id)
      if (!res?.success) throw new Error(res?.error || 'Failed to delete user')
      toast.success(`${u.name} deleted`)
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to delete user')
    }
    setDeletingId(null)
  }

  const INP = 'w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] transition-all'

  return (
    <div className="flex flex-col gap-4">
      {passwordTarget && (
        <SetPasswordModal target={passwordTarget} onClose={() => setPasswordTarget(null)} onSaved={load} />
      )}
      {editTarget && (
        <EditUserModal target={editTarget} onClose={() => setEditTarget(null)} onSaved={load} />
      )}

      {/* Role explanation cards */}
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(roleDesc).map(([role, desc]) => (
          <div key={role} className="rounded-xl border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold mb-2"
              style={{ background: (roleColor[role] || '#6B7280') + '20', color: roleColor[role] || '#6B7280' }}>
              {roleLabel[role]}
            </span>
            <p className="text-xs text-[var(--text-faint)] leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {/* Add user form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-[var(--surface)] border border-[var(--accent)] rounded-xl p-5 flex flex-col gap-4">
          <div className="text-sm font-bold text-[var(--text)]">Add New User</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-faint)] mb-1.5 block">Full Name *</label>
              <input className={INP} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Ali Hassan" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-faint)] mb-1.5 block">Email *</label>
              <input className={INP} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="ali@example.com" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-faint)] mb-1.5 block">Password *</label>
              <input className={INP} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 6 characters" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-faint)] mb-1.5 block">Role *</label>
              <select className={INP} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value, org_id: '' }))}>
                <option value="sales_user">Salesman / Cashier (main branch)</option>
                <option value="distributor_user">Distributor Staff</option>
                <option value="super_admin">Super Admin</option>
              </select>
              <p className="text-xs text-[var(--text-faint)] mt-1">{roleDesc[form.role]}</p>
            </div>
            {form.role !== 'super_admin' && (
              <div className="col-span-2">
                <label className="text-xs font-semibold text-[var(--text-faint)] mb-1.5 block">Branch / Organisation *</label>
                <select className={INP} value={form.org_id} onChange={e => setForm(f => ({ ...f, org_id: e.target.value }))}>
                  <option value="">— Select branch —</option>
                  {orgs.filter(o => form.role === 'sales_user' ? o.type === 'main' : o.type === 'distributor').map(o => (
                    <option key={o.id} value={o.id}>{o.name} ({o.type})</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {err && <div className="text-sm text-[var(--bad-text)] font-semibold">{err}</div>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--accent)', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Creating…' : 'Create User'}
            </button>
            <button type="button" onClick={() => { setShowAdd(false); setErr('') }} className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text-dim)] bg-[var(--surface-2)] border border-[var(--border)]">
              Cancel
            </button>
          </div>
        </form>
      )}

      <Section title={`All Users (${staff.length})`} sub="Click + Add User to create salesmen, managers, or admins" icon="users"
        action={!showAdd && <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: 'var(--accent)' }}><Icon name="plus" size={12} sw={2.5} /> Add User</button>}>
        <DataTable loading={loading} emptyMsg="No users yet" rows={staff}
          cols={[
            { label: 'User', render: r => (
              <div className="flex items-center gap-3">
                <div style={{ width: 32, height: 32, borderRadius: 99, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, color: 'var(--accent-text)', flexShrink: 0 }}>
                  {(r.name || 'U').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-[var(--text)]">{r.name}</div>
                  <div className="text-xs text-[var(--text-faint)]">{r.email}</div>
                </div>
              </div>
            )},
            { label: 'Phone', render: r => <span className="text-xs text-[var(--text-dim)] mono">{r.phone || '—'}</span> },
            { label: 'Branch', render: r => <span className="text-xs text-[var(--text-dim)] font-semibold">{r.org_name || '— Main Admin —'}</span> },
            { label: 'Role', render: r => (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold"
                style={{ background: (roleColor[r.role] || '#6B7280') + '20', color: roleColor[r.role] || '#6B7280' }}>
                {roleLabel[r.role] || r.role}
              </span>
            )},
            { label: 'Status', render: r => (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer" style={{ color: r.is_active ? 'var(--ok-text)' : 'var(--bad-text)' }} onClick={() => toggleActive(r)}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: r.is_active ? 'var(--ok)' : 'var(--bad)' }} />
                {r.is_active ? 'Active' : 'Inactive'} (click to toggle)
              </span>
            )},
            { label: 'Joined', render: r => <span className="text-xs text-[var(--text-faint)] mono">{r.created_at?.slice(0, 10) || '—'}</span> },
            { label: '', render: r => {
              const isSelf = r.id === currentUser?.id
              return (
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={() => setEditTarget(r)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
                    Edit
                  </button>
                  <button onClick={() => setPasswordTarget(r)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
                    Set Password
                  </button>
                  <button onClick={() => handleDelete(r)} disabled={isSelf || deletingId === r.id}
                    title={isSelf ? "You can't delete your own account" : 'Delete permanently'}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                    style={{ background: 'var(--bad-soft)', color: 'var(--bad-text)', opacity: isSelf || deletingId === r.id ? 0.5 : 1, cursor: isSelf ? 'not-allowed' : 'pointer' }}>
                    {deletingId === r.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              )
            }},
          ]}
        />
      </Section>
    </div>
  )
}

// ─── Help ───────────────────────────────────────────────────────────────────

const HELP_TOPICS = [
  { icon: 'home', title: 'Overview', body:
    'Dashboard KPIs (today\'s revenue, 30-day revenue, inventory value, all-time revenue), a revenue chart, and a category breakdown. Click the Inventory Value card to jump straight to the low-stock product list.' },
  { icon: 'box', title: 'Products', body:
    'The product catalogue: add/edit items, set retail and wholesale pricing (a fixed amount or a percentage markup over cost), category, SKU, and active/inactive status. Products are flagged low-stock automatically once quantity falls below the reorder threshold you set.' },
  { icon: 'download', title: 'Stock Intake', body:
    'Receive new stock from a supplier: pick the product, quantity, and unit cost. Every intake here also becomes a Batch History entry and an inventory increase, so cost and quantity should reflect what physically arrived.' },
  { icon: 'cart', title: 'Suppliers', body:
    '"New Bill" records a delivery received from a supplier on credit — each line added increases inventory immediately. If a bill isn\'t paid in full up front, a due date is required. Each supplier\'s page shows billed/paid/outstanding/overdue totals and a running-balance ledger; "Record Payment" pays down a bill\'s balance and is capped at what\'s still owed.' },
  { icon: 'ledger', title: 'Stock Ledger', body:
    'Manually adjust a product\'s on-hand quantity for damage, loss, or a physical-count correction — a reason is required, notes are optional. Also shows the full movement history (intake, sales, transfers, returns, adjustments) filterable by product.' },
  { icon: 'clock', title: 'Batch History', body:
    'Per-product traceability. The list shows every product with incoming-stock history (batch count, total units received, total cost, last delivery date); drilling into one product shows each individual delivery batch with supplier, quantity, cost, and who received it.' },
  { icon: 'lightning', title: 'Activity', body:
    'A network-wide, most-recent-first log of everything happening across every branch: sales, payments, stock intake, stock adjustments, shipments sent/received, returns/replacements, warranty claims, new staff, and new products. Filter to a single branch, or leave it on "All Branches." Refreshes automatically every 30 seconds.' },
  { icon: 'list', title: 'Sales History', body:
    'Every invoice across the network, searchable and filterable by branch. Open an invoice to see its full line items, record additional payments against it, or void it (only allowed when it has no linked return or warranty claim, and a reason must be typed).' },
  { icon: 'card', title: 'Due Payments', body:
    'Every outstanding balance across sales invoices and distributor supply orders in one place, so nothing owed to the business gets missed. "Record Payment" defaults to the full remaining balance and won\'t accept more than that.' },
  { icon: 'arrow-up', title: 'Returns', body:
    'A three-step wizard: look up the original invoice by number, choose Return for Refund or Replace with New Item, then pick which purchased items/quantities to hand back (already-returned quantities are excluded automatically). Inventory updates automatically for both the returned and any replacement items.' },
  { icon: 'arrow', title: 'Distributor Supply', body:
    'Send stock from the main warehouse to a distributor branch on credit (a due date is required). Pricing can be set per product or as one bulk margin % applied to every line. Stock leaves your inventory as soon as the order is created, but only reaches the distributor\'s inventory once they confirm receipt on their end.' },
  { icon: 'users', title: 'All Users', body:
    'Create and manage login accounts for three roles: Super Admin (full access, no branch needed), Distributor Staff (full access to one distributor branch), and Salesman/Cashier (main-branch POS only). Every role except Super Admin requires picking a branch/organization. Click a user\'s status to toggle Active/Inactive.' },
  { icon: 'shield', title: 'Warranty', body:
    'File a claim by looking up the original invoice (any branch) and selecting the purchased item, or by manual entry when there\'s no receipt. Claims move Open → In Progress → Resolved/Closed. "Issue Replacement" (invoice-linked claims only) creates a zero-cost replacement invoice, removes a unit from that branch\'s stock, starts a fresh warranty period, and resolves the claim.' },
  { icon: 'zap', title: 'Distributors', body:
    'All distributor branches with sortable stats: total ordered, outstanding balance, overdue amount, recent activity, and inventory value. "Add Distributor" creates both the branch and its manager login account in one step. Drill into a branch for its supply history, its own sales performance, and a full account ledger.' },
  { icon: 'cloud', title: 'System', body:
    'Shows how much of the free-tier database and file storage is in use, with a rough estimate of remaining capacity — informational only, not billing data. The Data Archive tool lets you export old, fully-paid invoices and intake logs to a backup file and then permanently delete them; deletion only unlocks after the backup downloads and requires typing DELETE to confirm. Unpaid invoices are never touched.' },
  { icon: 'edit', title: 'Receipt Settings', body:
    'Business name, tagline, phone numbers, address, and receipt footer message that print on every invoice and PDF receipt, with a live preview. Save/Discard only activate once something has actually changed.' },
]

function HelpView() {
  return (
    <div className="flex flex-col gap-5">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-sm">
        <div className="text-sm font-bold text-[var(--text)] mb-1">How this panel works</div>
        <p className="text-sm text-[var(--text-faint)] leading-relaxed">
          This is the admin panel for the whole network — every branch's sales, stock, staff, and money
          flow through here. Click a topic below for what it does and anything non-obvious about it.
        </p>
      </div>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm divide-y divide-[var(--border)]">
        {HELP_TOPICS.map(t => (
          <details key={t.title} className="group">
            <summary className="flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none list-none hover:bg-[var(--surface-2)]">
              <Icon name={t.icon} size={15} sw={2} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span className="text-sm font-semibold text-[var(--text)] flex-1">{t.title}</span>
              <Icon name="chev" size={13} sw={2} style={{ color: 'var(--text-faint)', transform: 'rotate(-90deg)' }} className="group-open:rotate-0 transition-transform" />
            </summary>
            <p className="px-5 pb-4 pl-[2.9rem] text-sm text-[var(--text-faint)] leading-relaxed">{t.body}</p>
          </details>
        ))}
      </div>
    </div>
  )
}


// ─── Root ─────────────────────────────────────────────────────────────────────

export default function AdminDashboardNew() {
  const { user } = useAuth()
  const { currentOrg } = useOrganization()
  // Use the org from context (loaded from DB), fallback to user's org_id
  const ORG_ID = currentOrg?.id || user?.org_id || ''

  const [view, setView]               = useState('products')
  const [lowStockJump, setLowStockJump] = useState(false)
  const [loading, setLoading]         = useState(true)
  const [products, setProducts]       = useState([])
  const [kpi, setKpi]                 = useState({})
  const [dailyRev, setDailyRev]       = useState([])
  const [catRev, setCatRev]           = useState([])
  const [topProducts, setTopProducts] = useState([])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const prodRes = await window.api.productsGetWithStock(ORG_ID)
      setProducts(prodRes?.success ? prodRes.data : [])

      const overviewRes = await window.api.analyticsOverview(ORG_ID)
      const data = overviewRes?.success ? overviewRes.data : {}
      setKpi(data)
      setDailyRev(fillDays(data.daily || [], 30))
      setCatRev((data.category || []).map(r => ({ name: r.name, value: Number(r.value) })))
      setTopProducts((data.top_products || []).map(r => ({ name: r.name?.slice(0, 22), revenue: Number(r.revenue) })))
    } catch {}
    setLoading(false)
  }, [ORG_ID])

  useEffect(() => { loadAll() }, [loadAll])

  return (
    <AppLayout currentView={view} onViewChange={setView} navItems={NAV}>
      <DueAlertBanner orgId={ORG_ID} onViewDues={() => setView('dues')} />
      {view === 'overview'     && <OverviewView kpi={kpi} dailyRev={dailyRev} catRev={catRev} topProducts={topProducts} loading={loading} onViewLowStock={() => { setLowStockJump(true); setView('products') }} />}
      {view === 'activity'     && <ActivityFeedView />}
      {view === 'products'     && <ProductsView products={products} loading={loading} onRefresh={loadAll} orgId={ORG_ID} initialLowStockOnly={lowStockJump} onConsumedLowStockJump={() => setLowStockJump(false)} />}
      {view === 'intake'       && <IntakeView products={products.filter(p => p.is_active !== false)} onRefresh={loadAll} orgId={ORG_ID} />}
      {view === 'suppliers'    && <Suppliers products={products.filter(p => p.is_active !== false)} orgId={ORG_ID} />}
      {view === 'ledger'       && <LedgerView products={products.filter(p => p.is_active !== false)} orgId={ORG_ID} currentUser={user} onRefresh={loadAll} />}
      {view === 'batches'      && <BatchHistoryView products={products} orgId={ORG_ID} />}
      {view === 'sales'        && <SalesView />}
      {view === 'dues'         && <DuePaymentsPanel orgId={ORG_ID} includeSupply />}
      {view === 'supply'       && <DistributorSupply products={products.filter(p => p.is_active !== false)} onRefresh={loadAll} orgId={ORG_ID} />}
      {view === 'returns'      && <ReturnReplace orgId={ORG_ID} currentUser={user} products={products} />}
      {view === 'staff'        && <StaffView />}
      {view === 'distributors' && <DistributorPerformance />}
      {view === 'warranty'     && <WarrantyClaims />}
      {view === 'system'       && <SystemStatus />}
      {view === 'settings'     && <OrgSettings orgId={ORG_ID} />}
      {view === 'help'         && <HelpView />}
    </AppLayout>
  )
}
