import { useState, useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Icon, Spinner } from '../components/DesignSystem'
import { RevenueChart, CategoryDonut, CatLegend, CAT_COLORS } from '../components/Charts'
import { useAuth } from '../contexts/AuthContext'
import { LedgerTable } from './Suppliers'

// Distributor-only tabs, shown alongside the shared POS nav when the signed-in
// user is a distributor_user (a distributor branch has no separate
// admin/cashier tier — every account there gets the same full access).

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
      label:   dateStr.slice(5),
      date:    dateStr,
      revenue: Number(map[dateStr]?.revenue || 0),
      count:   Number(map[dateStr]?.count   || 0),
    }
  })
}

function KpiCard({ label, value, sub, icon, color = 'teal' }) {
  const colors = {
    teal:    { bg: 'rgba(20,184,166,0.12)',  icon: '#14B8A6' },
    emerald: { bg: 'rgba(16,185,129,0.12)',  icon: '#10B981' },
    amber:   { bg: 'rgba(245,158,11,0.12)',  icon: '#F59E0B' },
    blue:    { bg: 'rgba(59,130,246,0.12)',  icon: '#3B82F6' },
  }
  const c = colors[color] || colors.teal
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-3 shadow-sm">
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

// ─── Overview ─────────────────────────────────────────────────────────────────

export function OverviewView({ orgId }) {
  const [kpi, setKpi]           = useState({})
  const [dailyRev, setDailyRev] = useState([])
  const [catRev, setCatRev]     = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await window.api.analyticsOverview(orgId)
        const data = res?.success ? res.data : {}
        setKpi(data)
        setDailyRev(fillDays(data.daily || [], 30))
        setCatRev((data.category || []).map(r => ({ name: r.name, value: Number(r.value) })))
      } catch {}
      setLoading(false)
    }
    load()
  }, [orgId])

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Today's Revenue"   value={rs(kpi?.today_revenue)} sub={`${kpi?.today_count || 0} invoices`}              icon="zap"   color="teal"    />
        <KpiCard label="Revenue (30 days)" value={rs(kpi?.rev30d)}        sub={`${kpi?.count30d || 0} invoices`}                 icon="chart" color="emerald" />
        <KpiCard label="Inventory Value"   value={rs(kpi?.inv_value)}     sub={`${kpi?.low_stock || 0} low-stock items`}         icon="box"   color="amber"   />
        <KpiCard label="All-Time Revenue"  value={rs(kpi?.total_revenue)} sub={`${kpi?.total_sales || 0} total invoices`}        icon="star"  color="blue"    />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-[var(--text)]">Branch Revenue — Last 30 Days</div>
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
            <div className="text-xs text-[var(--text-faint)] mt-0.5">All-time</div>
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
    </div>
  )
}

// ─── Staff ────────────────────────────────────────────────────────────────────
// A distributor branch has no admin/cashier split — every account here is a
// full distributor_user, so "Add Staff" doesn't offer a role picker either.

export function StaffView({ orgId }) {
  const [staff, setStaff]     = useState([])
  const [loading, setLoad]    = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [form, setForm]       = useState({ name: '', email: '', password: '' })
  const [err, setErr]         = useState('')

  const roleLabel = { distributor_user: 'Distributor Staff', super_admin: 'Super Admin' }
  const roleColor = { distributor_user: '#3B82F6', super_admin: '#14B8A6' }

  function load() {
    setLoad(true)
    window.api.staffGetAllInOrg(orgId)
      .then(r => setStaff(r?.success ? r.data : []))
      .catch(() => {})
      .finally(() => setLoad(false))
  }
  useEffect(() => { load() }, [orgId])

  async function handleAdd(e) {
    e.preventDefault()
    setErr('')
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setErr('Name, email and password are required')
      return
    }
    if (form.password.length < 6) {
      setErr('Password must be at least 6 characters')
      return
    }
    setSaving(true)
    try {
      // Role and branch are fixed — everyone at a distributor branch gets the
      // same full access, there's no separate admin/cashier tier to choose.
      const res = await window.api.authRegister(form.email.trim(), form.password, 'distributor_user', form.name.trim(), orgId)
      if (!res.success) throw new Error(res.error)
      toast.success(`${form.name} added to this branch`)
      setShowAdd(false)
      setForm({ name: '', email: '', password: '' })
      load()
    } catch (e) { setErr(e.message) }
    setSaving(false)
  }

  async function toggleActive(u) {
    await window.api.staffSetActive(u.id, !u.is_active)
    load()
  }

  const INP = 'w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] transition-all'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-[var(--text)]">Branch Staff ({staff.length})</div>
        <button onClick={() => { setShowAdd(v => !v); setErr('') }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>
          <Icon name="plus" size={14} sw={2.5} /> Add Staff
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-[var(--surface)] border border-[var(--accent)] rounded-xl p-5 flex flex-col gap-4">
          <div className="text-sm font-bold text-[var(--text)]">Add New Staff</div>
          <p className="text-xs text-[var(--text-faint)] -mt-2">Creates a full-access account for this branch — they'll see everything you see, and can sign in to the POS immediately.</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
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
          </div>
          {err && <div className="text-xs font-semibold" style={{ color: 'var(--bad-text)' }}>{err}</div>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--accent)', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Creating…' : 'Create Staff'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text-dim)] bg-[var(--surface-2)] border border-[var(--border)]">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
        {loading ? <div className="flex justify-center py-12"><Spinner /></div> : (
          !staff.length ? (
            <div className="flex flex-col items-center py-12 gap-3 text-[var(--text-faint)]">
              <Icon name="users" size={28} sw={1.5} />
              <span className="text-sm">No staff assigned to this branch yet</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    {['Name', 'Role', 'Status', 'Joined', ''].map((h, i) => (
                      <th key={i} className="text-left py-2.5 px-4 text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider first:pl-5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {staff.map((u, i) => (
                    <tr key={i} className="hover:bg-[var(--surface-2)] transition-colors">
                      <td className="py-3 px-4 pl-5">
                        <div className="flex items-center gap-3">
                          <div style={{ width: 32, height: 32, borderRadius: 99, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, color: 'var(--accent-text)', flexShrink: 0 }}>
                            {(u.name || 'U').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-[var(--text)]">{u.name}</div>
                            <div className="text-xs text-[var(--text-faint)]">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold"
                          style={{ background: (roleColor[u.role] || '#6B7280') + '20', color: roleColor[u.role] || '#6B7280' }}>
                          {roleLabel[u.role] || u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: u.is_active ? 'var(--ok-text)' : 'var(--text-faint)' }}>
                          <span style={{ width: 6, height: 6, borderRadius: 99, background: u.is_active ? 'var(--ok)' : 'var(--border-strong)' }} />
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--text-faint)] mono">{u.created_at?.slice(0, 10) || '—'}</td>
                      <td className="py-3 px-4">
                        {u.role === 'distributor_user' && (
                          <button onClick={() => toggleActive(u)} className="px-2 py-1 rounded text-xs font-semibold"
                            style={{ background: u.is_active ? 'var(--bad-soft)' : 'var(--ok-soft)', color: u.is_active ? 'var(--bad-text)' : 'var(--ok-text)', border: `1px solid ${u.is_active ? 'var(--bad)' : 'var(--ok)'}` }}>
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  )
}

// ─── Incoming Shipments ───────────────────────────────────────────────────────

export function IncomingShipmentsView({ orgId, onConfirmed }) {
  const { user } = useAuth()
  const [orders, setOrders]     = useState([])
  const [loading, setLoad]      = useState(true)
  const [confirming, setConf]   = useState(null)
  const [expanded, setExpanded] = useState(null)
  const seenPendingIds = useRef(null) // null until first load, so we never toast for pre-existing history
  const isFirstLoad = useRef(true) // only the initial load should show the full loading state — background polls refresh silently so the page doesn't visibly "reload" every 20s

  const load = async () => {
    if (isFirstLoad.current) setLoad(true)
    try {
      const res = await window.api.supplyIncoming(orgId)
      if (res.success) {
        const newOrders = res.data || []
        const pendingIds = new Set(newOrders.filter(o => o.receipt_status !== 'received').map(o => o.id))
        if (seenPendingIds.current) {
          for (const o of newOrders) {
            if (o.receipt_status !== 'received' && !seenPendingIds.current.has(o.id)) {
              toast.success(`New shipment from ${o.from_org_name || 'head office'}: ${o.order_number}`, { duration: 6000, icon: '📦' })
            }
          }
        }
        seenPendingIds.current = pendingIds
        setOrders(newOrders)
      }
    } catch {}
    if (isFirstLoad.current) { setLoad(false); isFirstLoad.current = false }
  }

  useEffect(() => { load() }, [orgId])

  // Poll so a shipment sent while this tab is already open shows up (and is
  // notified) without anyone having to manually hit Refresh.
  useEffect(() => {
    const interval = setInterval(load, 20000)
    return () => clearInterval(interval)
  }, [orgId])

  const pending  = orders.filter(o => o.receipt_status !== 'received')
  const received = orders.filter(o => o.receipt_status === 'received')

  async function confirmReceipt(orderId) {
    setConf(orderId)
    try {
      const res = await window.api.supplyConfirmReceipt(orderId, user?.name || 'Staff')
      if (!res.success) throw new Error(res.error)
      setOrders(prev => prev.map(o => o.id === orderId
        ? { ...o, receipt_status: 'received', received_at: new Date().toISOString() }
        : o
      ))
      toast.success('Stock confirmed! Your inventory has been updated.')
      onConfirmed?.()
    } catch (err) {
      toast.error(err.message)
    }
    setConf(null)
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860 }}>

      {pending.length > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 12, background: 'var(--warn-soft)', border: '1.5px solid rgba(245,158,11,0.5)' }}>
          <Icon name="alert" size={20} sw={2} style={{ color: 'var(--warn-text)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warn-text)' }}>
              {pending.length} incoming shipment{pending.length > 1 ? 's' : ''} waiting for confirmation
            </div>
            <div style={{ fontSize: 12, color: 'var(--warn-text)', marginTop: 2, opacity: 0.85 }}>
              When you physically receive the stock, click "Confirm Receipt" to add it to your inventory.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, background: 'var(--ok-soft)', border: '1px solid rgba(16,185,129,0.35)' }}>
          <Icon name="check" size={16} sw={2.5} style={{ color: 'var(--ok-text)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ok-text)' }}>All shipments confirmed. No pending stock.</span>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="clock" size={15} sw={2} style={{ color: 'var(--warn-text)' }} />
            Pending Confirmation
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map(o => (
              <div key={o.id} style={{ background: 'var(--surface)', border: '2px solid rgba(245,158,11,0.4)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent-text)' }}>{o.order_number}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--warn-soft)', color: 'var(--warn-text)' }}>Awaiting Receipt</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>From: {o.from_org_name || 'Sameer Battery House'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>Sent: {o.created_at?.slice(0, 10)} · {o.items?.length || 0} product{(o.items?.length || 0) !== 1 ? 's' : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right', marginRight: 8 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>
                      Rs {Math.round(o.total_amount).toLocaleString('en-PK')}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>Due: {o.due_date}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setExpanded(expanded === o.id ? null : o.id)} style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {expanded === o.id ? 'Hide' : 'View Items'}
                    </button>
                    <button
                      onClick={() => confirmReceipt(o.id)}
                      disabled={confirming === o.id}
                      style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--ok)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: confirming === o.id ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <Icon name="check" size={13} sw={2.5} />
                      {confirming === o.id ? 'Confirming…' : 'Confirm Receipt'}
                    </button>
                  </div>
                </div>
                {expanded === o.id && (
                  <div style={{ padding: '0 18px 14px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8, marginTop: 10 }}>Items in this shipment</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Product', 'Category', 'Qty', 'Your Price', 'Line Total'].map((h,i) => (
                          <th key={i} style={{ textAlign: i >= 2 ? 'right' : 'left', padding: '6px 10px', fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>{(o.items || []).map((it, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text)' }}>{it.product_name}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'var(--surface-3)', color: 'var(--text-dim)' }}>{it.category}</span>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{it.quantity}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-text)', fontWeight: 700 }}>Rs {Math.round(it.unit_price).toLocaleString('en-PK')}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>Rs {Math.round(it.line_total).toLocaleString('en-PK')}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {received.length > 0 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="check" size={15} sw={2.5} style={{ color: 'var(--ok-text)' }} />
            Confirmed Shipments ({received.length})
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {received.map((o, i) => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 18px', borderBottom: i < received.length - 1 ? '1px solid var(--border)' : 'none', gap: 14 }}>
                <Icon name="check" size={14} sw={2.5} style={{ color: 'var(--ok-text)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent-text)' }}>{o.order_number}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>from {o.from_org_name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                    Sent: {o.created_at?.slice(0, 10)} · Confirmed: {o.received_at?.slice(0, 10) || '—'} · {o.items?.length || 0} products
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                  Rs {Math.round(o.total_amount).toLocaleString('en-PK')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={load} style={{ alignSelf: 'flex-start', padding: '8px 16px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="arrow" size={12} sw={2} style={{ transform: 'rotate(90deg)' }} /> Refresh
      </button>
    </div>
  )
}

// ─── Main Company Account (what this branch owes head office, and reporting a payment) ──
// Reporting a payment here only creates a payment_claims row — it never touches
// distributor_supply_orders.amount_paid directly. The balance only moves once
// the main company confirms the claim from their side (Due Payments tab), so a
// branch can't unilaterally mark its own debt as paid.

const CLAIM_STATUS = {
  pending:   { label: 'Awaiting Confirmation', bg: 'var(--warn-soft)', color: 'var(--warn-text)' },
  confirmed: { label: 'Confirmed',             bg: 'var(--ok-soft)',   color: 'var(--ok-text)'   },
  rejected:  { label: 'Rejected',              bg: 'var(--bad-soft)',  color: 'var(--bad-text)'  },
}

function ReportPaymentForm({ orders, onClose, onSaved, orgId, submittedBy }) {
  const [orderId, setOrderId] = useState(orders[0]?.id || '')
  const [amount, setAmount] = useState(String(Math.round(orders[0]?.balance || 0)))
  const [method, setMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const order = orders.find(o => o.id === orderId)
  const balance = order?.balance || 0

  function pickOrder(id) {
    setOrderId(id)
    const o = orders.find(x => x.id === id)
    setAmount(String(Math.round(o?.balance || 0)))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const amt = parseFloat(amount) || 0
    if (amt <= 0) { setError('Enter a valid amount'); return }
    if (amt > balance + 0.01) { setError(`Cannot exceed the outstanding balance of Rs ${Math.round(balance).toLocaleString('en-PK')}`); return }
    setSaving(true)
    try {
      const res = await window.api.paymentClaimSubmit(orgId, { supplyOrderId: orderId, amount: amt, paymentMethod: method, notes, submittedBy })
      if (!res?.success) throw new Error(res?.error || 'Failed to report payment')
      toast.success('Payment reported — awaiting confirmation from head office')
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
      <form onSubmit={handleSubmit} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-[var(--surface-2)] border-b border-[var(--border)]">
          <div className="font-bold text-[var(--text)] text-sm">Report a Payment to Head Office</div>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: 'var(--surface-3)' }}>
            <Icon name="x" size={12} sw={2.4} style={{ color: 'var(--text-faint)' }} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            This tells head office you sent money — it won't reduce your balance until they confirm it.
          </div>
          <div>
            <label style={FIELD_LBL}>Shipment</label>
            <select style={FIELD_INP} value={orderId} onChange={e => pickOrder(e.target.value)}>
              {orders.map(o => <option key={o.id} value={o.id}>{o.order_number} — Rs {Math.round(o.balance).toLocaleString('en-PK')} owed</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={FIELD_LBL}>Amount</label>
              <input style={{ ...FIELD_INP, fontFamily: 'var(--font-mono)' }} type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <label style={FIELD_LBL}>Method</label>
              <select style={FIELD_INP} value={method} onChange={e => setMethod(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="bank">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
          </div>
          <div>
            <label style={FIELD_LBL}>Notes</label>
            <input style={FIELD_INP} placeholder="e.g. transfer reference" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          {error && <div style={{ fontSize: 12, color: 'var(--bad-text)' }}>{error}</div>}
          <button type="submit" disabled={saving} style={{ padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Sending…' : 'Report Payment'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function MainCompanyAccountView({ orgId }) {
  const { user } = useAuth()
  const [mainOrg, setMainOrg] = useState(null)
  const [ledger, setLedger] = useState([])
  const [claims, setClaims] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const mo = await window.api.mainOrgGet()
      if (!mo?.success) return
      setMainOrg(mo.data)
      const [ledgerRes, claimsRes, ordersRes] = await Promise.all([
        window.api.distributorLedgerGet(mo.data.id, orgId),
        window.api.paymentClaimsGetMine(orgId),
        window.api.supplyIncoming(orgId),
      ])
      setLedger(ledgerRes?.success ? ledgerRes.data : [])
      setClaims(claimsRes?.success ? claimsRes.data : [])
      setOrders(ordersRes?.success ? ordersRes.data : [])
    } catch {}
    setLoading(false)
  }, [orgId])

  useEffect(() => { load() }, [load])

  const unpaidOrders = orders.filter(o => o.balance > 0.01)
  const totalOwed = unpaidOrders.reduce((s, o) => s + o.balance, 0)
  const totalPaid = ledger.filter(r => r.entry_type === 'payment').reduce((s, r) => s + (Number(r.credit) || 0), 0)
  const pendingClaims = claims.filter(c => c.status === 'pending')

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div className="flex flex-col gap-5">
      {showForm && (
        <ReportPaymentForm
          orders={unpaidOrders}
          orgId={orgId}
          submittedBy={user?.name || user?.email || ''}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest">You Owe {mainOrg?.name || 'Head Office'}</div>
          <div className="text-2xl font-extrabold mono text-[var(--bad-text)] mt-2">Rs {Math.round(totalOwed).toLocaleString('en-PK')}</div>
          <div className="text-xs text-[var(--text-faint)] mt-1">{unpaidOrders.length} shipment{unpaidOrders.length !== 1 ? 's' : ''} with a balance</div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest">Paid To Date</div>
          <div className="text-2xl font-extrabold mono text-[var(--ok-text)] mt-2">Rs {Math.round(totalPaid).toLocaleString('en-PK')}</div>
          <div className="text-xs text-[var(--text-faint)] mt-1">Confirmed payments only</div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest">Pending Confirmation</div>
          <div className="text-2xl font-extrabold mono text-[var(--warn-text)] mt-2">Rs {Math.round(pendingClaims.reduce((s, c) => s + Number(c.amount), 0)).toLocaleString('en-PK')}</div>
          <div className="text-xs text-[var(--text-faint)] mt-1">{pendingClaims.length} claim{pendingClaims.length !== 1 ? 's' : ''} awaiting head office</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sent money to {mainOrg?.name || 'head office'}? Report it here so they know to confirm it.</div>
        <button onClick={() => setShowForm(true)} disabled={!unpaidOrders.length}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white"
          style={{ background: unpaidOrders.length ? 'var(--accent)' : 'var(--surface-3)', cursor: unpaidOrders.length ? 'pointer' : 'not-allowed', color: unpaidOrders.length ? '#fff' : 'var(--text-faint)' }}>
          <Icon name="cash" size={14} sw={2} /> Report a Payment
        </button>
      </div>

      {claims.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 bg-[var(--surface-2)] border-b border-[var(--border)] text-sm font-bold text-[var(--text)]">My Reported Payments</div>
          <div className="divide-y divide-[var(--border)]">
            {claims.map(c => {
              const s = CLAIM_STATUS[c.status] || CLAIM_STATUS.pending
              return (
                <div key={c.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <div className="text-sm font-semibold text-[var(--text)]">Rs {Math.round(c.amount).toLocaleString('en-PK')} · {c.order_number}</div>
                    <div className="text-xs text-[var(--text-faint)] mt-0.5">{c.submitted_at?.slice(0, 16).replace('T', ' ')} · {c.payment_method}{c.notes ? ` · ${c.notes}` : ''}</div>
                  </div>
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <LedgerTable rows={ledger} loading={false} accountName={mainOrg?.name || 'head-office'} />
    </div>
  )
}

// ─── My Products (distributor's own catalogue + pricing on company products) ──
// A distributor branch can sell two kinds of product: shared/company products
// (created on the admin website, sent here via confirmed shipments) and its
// own private products it sources locally — those never appear on the admin
// website or any other branch. Either way, this branch always picks its own
// retail price: directly on its own products, or as an override on top of a
// company product's price (see productsGetWithStock in supabaseApi.js).

const FIELD_INP = {
  width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '9px 11px', fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'var(--font-ui)',
}
const FIELD_LBL = { fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '.04em' }

function ProdCatChip({ cat }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', background: (CAT_COLORS[cat] || '#6B7280') + '22', color: CAT_COLORS[cat] || '#6B7280' }}>
      {cat}
    </span>
  )
}

export function MyProductsView({ products, orgId, onRefresh }) {
  const [tab, setTab] = useState('own')
  const ownProducts = products.filter(p => p.is_own)
  const companyProducts = products.filter(p => !p.is_own)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { id: 'own', label: `My Own Products (${ownProducts.length})` },
          { id: 'pricing', label: `Company Products — My Pricing (${companyProducts.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '9px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            background: tab === t.id ? 'var(--accent)' : 'var(--surface-2)',
            color: tab === t.id ? '#fff' : 'var(--text-dim)',
            border: `1px solid ${tab === t.id ? 'var(--accent)' : 'var(--border)'}`,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'own'
        ? <OwnProductsPanel orgId={orgId} onRefresh={onRefresh} />
        : <CompanyPricingPanel products={companyProducts} orgId={orgId} onRefresh={onRefresh} />}
    </div>
  )
}

// Fetches its own copy of the product list (including inactive ones) rather
// than trusting the `products` prop the rest of this app uses — that one is
// always active-only (it feeds the POS cart), which would make a deactivated
// product impossible to find and reactivate here.
function OwnProductsPanel({ orgId, onRefresh }) {
  const EMPTY_FORM = { name: '', category: 'Accessories', brand: '', cost_price: '', retail_price: '', startingStock: '0', reorder_level: '5' }
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showAdd, setShowAdd]   = useState(false)
  const [editingId, setEditing] = useState(null)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [saving, setSaving]     = useState(false)
  const [categories, setCategories] = useState([])

  const loadOwnProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.api.productsGetWithStock(orgId, false)
      setProducts(res?.success ? res.data.filter(p => p.is_own) : [])
    } catch {}
    setLoading(false)
  }, [orgId])
  useEffect(() => { loadOwnProducts() }, [loadOwnProducts])

  function refreshBoth() { loadOwnProducts(); onRefresh() }

  const loadCategories = useCallback(async () => {
    const res = await window.api.categoriesGet()
    if (res.success) setCategories(res.data)
  }, [])
  useEffect(() => { loadCategories() }, [loadCategories])
  const catNames = categories.map(c => c.name)

  function startEdit(p) {
    setEditing(p.id)
    setForm({ name: p.name, category: p.category, brand: p.brand || '', cost_price: String(p.cost_price || 0), retail_price: String(p.retail_price), startingStock: '', reorder_level: String(p.reorder_level || 5), is_active: p.is_active !== false })
    setShowAdd(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name || !form.retail_price) return
    setSaving(true)
    try {
      if (editingId) {
        const res = await window.api.productsUpdate({
          id: editingId, name: form.name, category: form.category, brand: form.brand,
          retail_price: parseFloat(form.retail_price), cost_price: parseFloat(form.cost_price) || 0,
          reorder_level: parseInt(form.reorder_level) || 5, is_active: form.is_active !== false,
        })
        if (!res.success) throw new Error(res.error)
        toast.success(`${form.name} updated`)
        setEditing(null)
      } else {
        const res = await window.api.productsCreate({
          name: form.name, category: form.category, brand: form.brand,
          retail_price: parseFloat(form.retail_price), cost_price: parseFloat(form.cost_price) || 0,
          reorder_level: parseInt(form.reorder_level) || 5,
        }, orgId)
        if (!res.success) throw new Error(res.error)
        await window.api.inventoryUpdate(orgId, res.id, parseInt(form.startingStock) || 0)
        toast.success(`${form.name} added`)
        setShowAdd(false)
      }
      setForm(EMPTY_FORM)
      refreshBoth()
    } catch (err) {
      toast.error(err.message || 'Failed to save product')
    }
    setSaving(false)
  }

  async function toggleActive(p) {
    try {
      await window.api.productsUpdate({ id: p.id, name: p.name, category: p.category, brand: p.brand, retail_price: p.retail_price, cost_price: p.cost_price, reorder_level: p.reorder_level, is_active: !p.is_active })
      refreshBoth()
    } catch {}
  }

  const formPanel = (title) => (
    <form onSubmit={handleSave} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={FIELD_LBL}>Product Name *</label>
          <input style={FIELD_INP} required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Local Battery Terminal" />
        </div>
        <div>
          <label style={FIELD_LBL}>Category</label>
          <select style={FIELD_INP} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            {!catNames.includes(form.category) && form.category && <option value={form.category}>{form.category}</option>}
            {catNames.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={FIELD_LBL}>Brand</label>
          <input style={FIELD_INP} value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} placeholder="Optional" />
        </div>
        <div>
          <label style={FIELD_LBL}>Cost Price (PKR)</label>
          <input style={{ ...FIELD_INP, fontFamily: 'var(--font-mono)' }} type="number" min="0" value={form.cost_price} onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} placeholder="0" />
        </div>
        <div>
          <label style={FIELD_LBL}>Retail Price (PKR) *</label>
          <input style={{ ...FIELD_INP, fontFamily: 'var(--font-mono)' }} type="number" min="0" required value={form.retail_price} onChange={e => setForm(f => ({ ...f, retail_price: e.target.value }))} placeholder="0" />
        </div>
        {!editingId && (
          <div>
            <label style={FIELD_LBL}>Starting Stock</label>
            <input style={{ ...FIELD_INP, fontFamily: 'var(--font-mono)' }} type="number" min="0" value={form.startingStock} onChange={e => setForm(f => ({ ...f, startingStock: e.target.value }))} placeholder="0" />
          </div>
        )}
        <div>
          <label style={FIELD_LBL}>Reorder Level</label>
          <input style={{ ...FIELD_INP, fontFamily: 'var(--font-mono)' }} type="number" min="0" value={form.reorder_level} onChange={e => setForm(f => ({ ...f, reorder_level: e.target.value }))} placeholder="5" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" disabled={saving} style={{ padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', background: 'var(--accent)', color: '#fff', opacity: saving ? 0.6 : 1, cursor: 'pointer' }}>
          {saving ? 'Saving…' : editingId ? 'Update' : 'Add Product'}
        </button>
        <button type="button" onClick={() => { setShowAdd(false); setEditing(null); setForm(EMPTY_FORM) }} style={{ padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-dim)', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </form>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
        Products you add here are private to this branch — the main admin and other branches never see them.
      </div>

      {!showAdd && !editingId && (
        <button onClick={() => { setShowAdd(true); setForm(EMPTY_FORM) }} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}>
          <Icon name="plus" size={13} sw={2.5} /> Add Product
        </button>
      )}
      {showAdd && !editingId && formPanel('New Product')}
      {editingId && formPanel('Edit Product')}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
        ) : !products.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', gap: 10, color: 'var(--text-faint)' }}>
            <Icon name="grid" size={26} sw={1.5} />
            <span style={{ fontSize: 13 }}>No products of your own yet. Add one above.</span>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Product', 'Category', 'Retail', 'Cost', 'Stock', '', ''].map((h, i) => (
                  <th key={i} style={{ textAlign: i >= 2 && i <= 4 ? 'right' : 'left', padding: '10px 18px', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', opacity: p.is_active === false ? 0.5 : 1 }}>
                  <td style={{ padding: '11px 18px', fontWeight: 600, color: 'var(--text)' }}>{p.name}{p.brand ? <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> · {p.brand}</span> : null}</td>
                  <td style={{ padding: '11px 18px' }}><ProdCatChip cat={p.category} /></td>
                  <td style={{ padding: '11px 18px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-text)' }}>{rs(p.retail_price)}</td>
                  <td style={{ padding: '11px 18px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{rs(p.cost_price)}</td>
                  <td style={{ padding: '11px 18px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: p.qty_on_hand <= (p.reorder_level || 5) ? 'var(--bad-text)' : 'var(--ok-text)' }}>{p.qty_on_hand}</td>
                  <td style={{ padding: '11px 18px', textAlign: 'right' }}>
                    <button onClick={() => startEdit(p)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'var(--accent-soft)', color: 'var(--accent-text)', border: '1px solid var(--accent)', cursor: 'pointer' }}>Edit</button>
                  </td>
                  <td style={{ padding: '11px 18px', textAlign: 'right' }}>
                    <button onClick={() => toggleActive(p)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: p.is_active === false ? 'var(--ok-soft)' : 'var(--bad-soft)', color: p.is_active === false ? 'var(--ok-text)' : 'var(--bad-text)', border: 'none', cursor: 'pointer' }}>
                      {p.is_active === false ? 'Activate' : 'Deactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function CompanyPricingPanel({ products, orgId, onRefresh }) {
  const [editingId, setEditingId] = useState(null)
  const [priceInput, setPriceInput] = useState('')
  const [saving, setSaving] = useState(false)

  function startEdit(p) {
    setEditingId(p.id)
    setPriceInput(String(p.retail_price))
  }

  async function saveOverride(p) {
    setSaving(true)
    try {
      const res = await window.api.productPriceOverrideSet(orgId, p.id, priceInput)
      if (!res.success) throw new Error(res.error)
      toast.success(`Your price for ${p.name} updated`)
      setEditingId(null)
      onRefresh()
    } catch (err) {
      toast.error(err.message || 'Failed to save price')
    }
    setSaving(false)
  }

  async function resetToCompanyPrice(p) {
    setSaving(true)
    try {
      const res = await window.api.productPriceOverrideClear(orgId, p.id)
      if (!res.success) throw new Error(res.error)
      toast.success(`Reset to company price for ${p.name}`)
      onRefresh()
    } catch (err) {
      toast.error(err.message || 'Failed to reset price')
    }
    setSaving(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
        These come from the main company's catalogue. You can sell them at your own retail price — it only applies at your branch.
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        {!products.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', gap: 10, color: 'var(--text-faint)' }}>
            <Icon name="box" size={26} sw={1.5} />
            <span style={{ fontSize: 13 }}>No company products yet.</span>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Product', 'Category', 'Company Price', 'Your Price', ''].map((h, i) => (
                  <th key={i} style={{ textAlign: i >= 2 && i <= 3 ? 'right' : 'left', padding: '10px 18px', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '11px 18px', fontWeight: 600, color: 'var(--text)' }}>{p.name}</td>
                  <td style={{ padding: '11px 18px' }}><ProdCatChip cat={p.category} /></td>
                  <td style={{ padding: '11px 18px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{rs(p.company_retail_price)}</td>
                  <td style={{ padding: '11px 18px', textAlign: 'right' }}>
                    {editingId === p.id ? (
                      <input autoFocus style={{ ...FIELD_INP, fontFamily: 'var(--font-mono)', textAlign: 'right', width: 110 }} type="number" min="0"
                        value={priceInput} onChange={e => setPriceInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveOverride(p); if (e.key === 'Escape') setEditingId(null) }} />
                    ) : (
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: p.has_price_override ? 'var(--accent-text)' : 'var(--text-dim)' }}>
                        {rs(p.retail_price)}{p.has_price_override && <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 6, padding: '1px 6px', borderRadius: 99, background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>YOUR PRICE</span>}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '11px 18px', textAlign: 'right' }}>
                    {editingId === p.id ? (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => saveOverride(p)} disabled={saving} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}>Save</button>
                        <button onClick={() => setEditingId(null)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'var(--surface-2)', color: 'var(--text-dim)', border: '1px solid var(--border)', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => startEdit(p)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'var(--accent-soft)', color: 'var(--accent-text)', border: '1px solid var(--accent)', cursor: 'pointer' }}>Set Price</button>
                        {p.has_price_override && (
                          <button onClick={() => resetToCompanyPrice(p)} disabled={saving} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'var(--surface-2)', color: 'var(--text-dim)', border: '1px solid var(--border)', cursor: 'pointer' }}>Reset</button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Recent Activity (this branch's own — sales, payments, stock moves, shipments, returns, warranty, staff, products) ──

const ACTIVITY_META = {
  sale:             { label: 'Sale',              icon: 'cart',     color: '#14B8A6' },
  payment:          { label: 'Payment',           icon: 'cash',     color: '#10B981' },
  intake:           { label: 'Stock Intake',      icon: 'download', color: '#14B8A6' },
  adjustment:       { label: 'Stock Adjustment',  icon: 'edit',     color: '#F59E0B' },
  supply_sent:      { label: 'Shipment Sent',     icon: 'arrow',    color: '#14B8A6' },
  supply_received:  { label: 'Shipment Received', icon: 'check',    color: '#10B981' },
  return:           { label: 'Return / Replace',  icon: 'arrow-up', color: '#EF4444' },
  warranty:         { label: 'Warranty Claim',    icon: 'shield',   color: '#F59E0B' },
  staff_added:      { label: 'New Staff',         icon: 'users',    color: '#14B8A6' },
  product_added:    { label: 'Product Added',     icon: 'box',      color: '#14B8A6' },
}

function ActivityBadge({ type }) {
  const m = ACTIVITY_META[type] || { label: type, icon: 'info', color: '#6B7280' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: m.color + '22', color: m.color }}>
      <Icon name={m.icon} size={10} sw={2.5} />
      {m.label}
    </span>
  )
}

export function ActivityView({ orgId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const isFirstLoad = useRef(true) // only the initial load should show the loading state — background polls refresh silently

  const load = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true)
    try {
      const res = await window.api.activityFeedGet(orgId, 150)
      setRows(res?.success ? res.data : [])
    } catch {}
    if (isFirstLoad.current) { setLoading(false); isFirstLoad.current = false }
  }, [orgId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Everything that's happened at this branch, most recent first.</div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <Icon name="arrow" size={12} sw={2} style={{ transform: 'rotate(90deg)' }} /> Refresh
        </button>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
        ) : !rows.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', gap: 10, color: 'var(--text-faint)' }}>
            <Icon name="lightning" size={26} sw={1.5} />
            <span style={{ fontSize: 13 }}>No activity yet.</span>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Time', 'Type', 'Details', 'By', 'Amount'].map((h, i) => (
                  <th key={i} style={{ textAlign: i === 4 ? 'right' : 'left', padding: '10px 18px', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '11px 18px', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{r.created_at?.slice(0, 16).replace('T', ' ')}</td>
                  <td style={{ padding: '11px 18px' }}><ActivityBadge type={r.activity_type} /></td>
                  <td style={{ padding: '11px 18px', color: 'var(--text)' }}>{r.description}</td>
                  <td style={{ padding: '11px 18px', fontSize: 12, color: 'var(--text-faint)' }}>{r.actor || '—'}</td>
                  <td style={{ padding: '11px 18px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text)' }}>{r.amount != null ? rs(r.amount) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
