import { useState, useEffect, useCallback } from 'react'
import { Icon, Spinner } from '../components/DesignSystem'
import { useAuth } from '../contexts/AuthContext'
import { LedgerTable } from './Suppliers'

function rs(n) {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0)
  if (isNaN(num)) return 'Rs 0'
  return `Rs ${Math.round(num).toLocaleString('en-PK')}`
}

function Bar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ height: 6, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: color, transition: 'width .4s' }} />
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: color || 'var(--text)' }}>{value}</div>
    </div>
  )
}

export default function DistributorPerformance() {
  const { user } = useAuth()
  const orgId = user?.org_id || ''
  const [dists, setDists]   = useState([])
  const [loading, setLoad]  = useState(true)
  const [sortBy, setSortBy] = useState('total_ordered')
  const [selected, setSelected] = useState(null)
  
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', city: '', phone: '', email: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoad(true)
    try {
      const res = await window.api.distributorPerformance(orgId)
      if (res.success) setDists(res.data || [])
    } catch {}
    setLoad(false)
  }, [orgId])

  useEffect(() => { load() }, [load])

  async function handleAdd(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const orgRes = await window.api.orgCreate(form.name, 'distributor', form.email, form.phone, form.city)
      if (!orgRes.success) throw new Error(orgRes.error || 'Failed to create organization')
      
      const userRes = await window.api.authRegister(form.email, form.password, 'distributor_user', `${form.name} Admin`, orgRes.org_id)
      if (!userRes.success) throw new Error(userRes.error || 'Failed to create user account')
      
      setShowAdd(false)
      setForm({ name: '', city: '', phone: '', email: '', password: '' })
      load()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  const sorted = [...dists].sort((a, b) => Number(b[sortBy] || 0) - Number(a[sortBy] || 0))
  const maxOrdered = Math.max(...dists.map(d => Number(d.total_ordered || 0)), 1)

  const SORTS = [
    { key: 'total_ordered', label: 'Total Ordered' },
    { key: 'outstanding',   label: 'Outstanding'   },
    { key: 'overdue_amount',label: 'Overdue'        },
    { key: 'last30d',       label: 'Last 30 Days'  },
    { key: 'inv_value',     label: 'Inventory Value'},
  ]

  const INP = {
    width: '100%', background: 'var(--surface-2)', border: '1.5px solid var(--border)',
    borderRadius: 8, padding: '9px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', transition: 'border-color .2s'
  }
  const LBL = { fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '.04em' }

  // ─── DRILL DOWN VIEW ──────────────────────────────────────────────────────────
  if (selected) {
    const d = dists.find(x => x.id === selected)
    if (!d) { setSelected(null); return null; }
    const collectionPct = Number(d.total_ordered) > 0 ? Math.round(Number(d.total_paid) / Number(d.total_ordered) * 100) : 0

    return <DistributorDetail key={d.id} d={d} collectionPct={collectionPct} onBack={() => setSelected(null)} />
  }

  // ─── LIST VIEW ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Distributor Network</span>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{dists.length} active branches</span>
        
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {SORTS.map(s => (
            <button key={s.key} onClick={() => setSortBy(s.key)} style={{
              padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
              background: sortBy === s.key ? 'var(--accent)' : 'var(--surface-2)',
              color:      sortBy === s.key ? '#fff' : 'var(--text-dim)',
              transition: 'all .12s',
            }}>{s.label}</button>
          ))}
        </div>
        
        <button onClick={() => setShowAdd(true)} className="commit-btn--unlocked" style={{ padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, width: 'auto', height: 32, letterSpacing: 0 }}>
          <Icon name="plus" size={14} sw={2.5} /> Add Distributor
        </button>
      </div>

      {dists.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[
            { label: 'Total Supplied',  value: rs(dists.reduce((s,d) => s+Number(d.total_ordered||0),0)), color: 'var(--accent-text)' },
            { label: 'Total Collected', value: rs(dists.reduce((s,d) => s+Number(d.total_paid||0),0)),    color: 'var(--ok-text)'     },
            { label: 'Outstanding',     value: rs(dists.reduce((s,d) => s+Number(d.outstanding||0),0)),   color: 'var(--warn-text)'   },
            { label: 'Overdue',         value: rs(dists.reduce((s,d) => s+Number(d.overdue_amount||0),0)), color: 'var(--bad-text)'   },
          ].map((k, i) => (
            <div key={i} className="panel" style={{ padding: '14px 18px', border: 'none', background: 'var(--surface)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 18, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : !sorted.length ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-faint)', fontSize: 14 }}>No distributors found. Click "Add Distributor" to begin.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1fr auto', gap: 12, padding: '12px 18px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            <span>Distributor</span>
            <span style={{ textAlign: 'right' }}>Supplied</span>
            <span style={{ textAlign: 'right' }}>Collected</span>
            <span style={{ textAlign: 'right' }}>Outstanding</span>
            <span style={{ textAlign: 'right' }}>Overdue</span>
            <span style={{ textAlign: 'right' }}>Last 30 Days</span>
            <span></span>
          </div>

          {sorted.map((d, i) => {
            const collectionPct = Number(d.total_ordered) > 0 ? Math.round(Number(d.total_paid) / Number(d.total_ordered) * 100) : 0
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1fr auto', gap: 12, padding: '14px 18px', alignItems: 'center', cursor: 'pointer', transition: 'background .15s', borderBottom: i < sorted.length-1 ? '1px solid var(--border)' : 'none' }}
                onClick={() => setSelected(d.id)}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon name="zap" size={16} sw={2} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13.5 }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{d.city} · {d.order_count} orders</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12.5, color: 'var(--text)' }}>{rs(d.total_ordered)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5, justifyContent: 'flex-end' }}>
                    <Bar value={Number(d.total_ordered)} max={maxOrdered} color="var(--accent)" />
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12.5, color: 'var(--ok-text)' }}>
                  {rs(d.total_paid)}
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>{collectionPct}% col.</div>
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12.5, color: Number(d.outstanding) > 0 ? 'var(--warn-text)' : 'var(--text-faint)' }}>
                  {Number(d.outstanding) > 0.01 ? rs(d.outstanding) : '—'}
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12.5, color: Number(d.overdue_amount) > 0 ? 'var(--bad-text)' : 'var(--text-faint)' }}>
                  {Number(d.overdue_amount) > 0.01 ? rs(d.overdue_amount) : '—'}
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-dim)' }}>
                  {Number(d.last30d) > 0 ? rs(d.last30d) : '—'}
                </div>
                <Icon name="arrow" size={14} sw={2} style={{ color: 'var(--text-faint)' }} />
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <div className="anim-fade" style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <form onSubmit={handleAdd} className="anim-scale-in" style={{ width: 440, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
               <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Add New Distributor</h3>
               <button type="button" onClick={() => setShowAdd(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}>
                  <Icon name="x" size={18} sw={2} />
               </button>
            </div>
            
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
               {error && <div style={{ padding: 12, background: 'var(--bad-soft)', color: 'var(--bad-text)', fontSize: 13, borderRadius: 8, fontWeight: 600 }}>{error}</div>}
               
               <div>
                 <label style={LBL}>Business Name *</label>
                 <input style={INP} required placeholder="e.g. Solar Power Hub" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} />
               </div>
               
               <div>
                 <label style={LBL}>City *</label>
                 <input style={INP} required placeholder="e.g. Lahore" value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} />
               </div>
               
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                 <div>
                   <label style={LBL}>Phone</label>
                   <input style={INP} placeholder="0300..." value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} />
                 </div>
                 <div>
                   <label style={LBL}>Email *</label>
                   <input style={INP} type="email" required placeholder="admin@..." value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
                 </div>
               </div>

               <div>
                 <label style={LBL}>Admin Account Password *</label>
                 <input style={{...INP, fontFamily: 'var(--font-mono)'}} type="password" required placeholder="Minimum 6 characters" minLength="6" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} />
                 <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.4 }}>
                   This creates a login for the distributor branch manager. They can log in with the above email and password.
                 </div>
               </div>
            </div>
            
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
               <button type="button" onClick={() => setShowAdd(false)} style={{ padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-dim)', cursor: 'pointer' }}>Cancel</button>
               <button type="submit" disabled={saving} style={{ padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'var(--accent)', border: 'none', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                 {saving ? 'Creating...' : 'Create Account'}
               </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

// ─── Drill-down: one distributor's supply-order stats + their own downstream sales ──
function DistributorDetail({ d, collectionPct, onBack }) {
  const [overview, setOverview] = useState(null)
  const [recentSales, setRecentSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [ledger, setLedger] = useState([])
  const [ledgerLoading, setLedgerLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      window.api.analyticsOverview(d.id),
      window.api.salesGetWithItems(d.id),
    ]).then(([overviewRes, salesRes]) => {
      if (cancelled) return
      setOverview(overviewRes?.success ? overviewRes.data : null)
      setRecentSales(salesRes?.success ? (salesRes.data || []).slice(0, 8) : [])
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [d.id])

  useEffect(() => {
    let cancelled = false
    setLedgerLoading(true)
    // Only one 'main' org exists in this system (org_main_company — see
    // ensure_main_organization()), and the logged-in super_admin's own
    // org_id is null (that role never gets one), so it can't be used here.
    window.api.distributorLedgerGet('org_main_company', d.id)
      .then(res => { if (!cancelled) setLedger(res?.success ? res.data : []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLedgerLoading(false) })
    return () => { cancelled = true }
  }, [d.id])

  return (
    <div className="anim-fade" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1000 }}>
      <button onClick={onBack} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
        <Icon name="arrow" size={14} sw={2} style={{ transform: 'rotate(180deg)' }} /> Back to List
      </button>

      <div style={{ padding: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-md)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center' }}>
                <Icon name="zap" size={20} sw={2} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>{d.name}</h2>
                <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 2 }}>{d.city} · Registered Distributor</div>
              </div>
            </div>
          </div>
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>Stock Sent From Main Branch</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24, padding: 24, background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <Stat label="Total Ordered"      value={rs(d.total_ordered)} color="var(--accent-text)" />
          <Stat label="Total Collected"    value={rs(d.total_paid)}    color="var(--ok-text)" />
          <Stat label="Outstanding"        value={rs(d.outstanding)}   color="var(--warn-text)" />
          <Stat label="Overdue"            value={rs(d.overdue_amount)} color="var(--bad-text)" />

          <Stat label="Last 90 Days"        value={rs(d.last90d)} />
          <Stat label="Last Order"          value={d.last_order_at ? new Date(d.last_order_at).toLocaleDateString() : '—'} />
          <Stat label="Collection Rate"     value={`${collectionPct}%`} color={collectionPct >= 80 ? 'var(--ok-text)' : collectionPct >= 50 ? 'var(--warn-text)' : 'var(--bad-text)'} />
          <Stat label="Branches / Orders"   value={d.order_count} />
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '24px 0 12px' }}>This Branch's Own Sales &amp; Stock</h3>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner /></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24, padding: 24, background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
            <Stat label="Revenue (All-Time)"  value={rs(overview?.total_revenue)} color="var(--accent-text)" />
            <Stat label="Invoices (All-Time)" value={overview?.total_sales ?? 0} />
            <Stat label="Revenue (30 Days)"   value={rs(overview?.rev30d)} color="var(--ok-text)" />
            <Stat label="Current Stock Value" value={rs(overview?.inv_value)} />
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>Recent Sales at This Branch</h3>
          {loading ? null : !recentSales.length ? (
            <div style={{ fontSize: 13, color: 'var(--text-faint)', padding: '16px 0' }}>No sales recorded at this branch yet.</div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                    {['Invoice #', 'Customer', 'Cashier', 'Amount', 'Date'].map((h, i) => (
                      <th key={i} style={{ textAlign: i === 3 ? 'right' : 'left', padding: '9px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-text)' }}>{s.invoice_number}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text)' }}>{s.customer_name || '—'}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>{s.created_by || '—'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text)' }}>{rs(s.final_amount)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 11.5, color: 'var(--text-faint)' }}>{s.local_created_at?.slice(0, 16).replace('T', ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ marginTop: 24 }}>
          <LedgerTable rows={ledger} loading={ledgerLoading} accountName={d.name} />
        </div>

        <div style={{ marginTop: 24 }}>
           <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>Contact Details</h3>
           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                 <Icon name="phone" size={16} sw={2} style={{ color: 'var(--text-dim)' }} />
                 <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{d.phone || 'N/A'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                 <Icon name="mail" size={16} sw={2} style={{ color: 'var(--text-dim)' }} />
                 <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{d.email || 'N/A'}</span>
              </div>
           </div>
        </div>
      </div>
    </div>
  )
}
