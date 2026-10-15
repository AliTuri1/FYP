import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Icon, Spinner } from './DesignSystem'
import { useAuth } from '../contexts/AuthContext'

function rs(n) {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0)
  if (isNaN(num)) return 'Rs 0'
  return `Rs ${Math.round(num).toLocaleString('en-PK')}`
}

function defaultDueDate(days = 30) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function DueStatusBadge({ status, dueDate }) {
  const today = new Date().toISOString().slice(0, 10)
  let label = status
  let bg = 'var(--warn-soft)'
  let color = 'var(--warn-text)'

  if (status === 'paid') {
    label = 'Paid'
    bg = 'var(--ok-soft)'
    color = 'var(--ok-text)'
  } else if (status === 'partial') {
    label = 'Partial'
    bg = 'var(--info-soft)'
    color = 'var(--info-text)'
  } else if (dueDate && dueDate < today) {
    label = 'Overdue'
    bg = 'var(--bad-soft)'
    color = 'var(--bad-text)'
  } else if (status === 'pending') {
    label = 'Unpaid'
  }

  return (
    <span className="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize"
      style={{ background: bg, color }}>{label}</span>
  )
}

function RecordPaymentModal({ item, onClose, onSaved }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const balance = parseFloat(item.balance) || 0

  useEffect(() => {
    setAmount(String(Math.round(balance)))
  }, [item, balance])

  async function handleSubmit(e) {
    e.preventDefault()
    const amt = parseFloat(amount) || 0
    if (amt <= 0) { setError('Enter a valid amount'); return }
    if (amt > balance + 0.01) { setError(`Cannot exceed balance of ${rs(balance)}`); return }

    setSaving(true)
    setError('')
    try {
      const payload = {
        amount: amt,
        payment_method: method,
        notes,
      }
      if (item.source === 'sale') payload.invoice_id = item.id
      else payload.supply_order_id = item.id

      const res = await window.api.paymentRecord(payload)
      if (!res?.success) throw new Error(res?.error || 'Payment failed')
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  const INP = {
    width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '9px 12px', fontSize: 13, color: 'var(--text)', outline: 'none',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-[var(--surface-2)]">
          <div>
            <div className="font-bold text-[var(--text)]">Record Payment</div>
            <div className="text-xs text-[var(--text-faint)] mt-0.5">{item.ref_number} · {item.party_name}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-faint)] hover:bg-[var(--surface-3)]">
            <Icon name="x" size={14} sw={2.2} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm">
            <div>
              <div className="text-xs text-[var(--text-faint)]">Total</div>
              <div className="mono font-bold">{rs(item.total_amount)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-faint)]">Balance Due</div>
              <div className="mono font-bold text-[var(--bad-text)]">{rs(balance)}</div>
            </div>
            {item.due_date && (
              <div className="col-span-2">
                <div className="text-xs text-[var(--text-faint)]">Due Date</div>
                <div className="font-semibold">{item.due_date}</div>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider">Amount</label>
            <div className="flex gap-2 mt-1">
              <input style={INP} type="number" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)} className="mono flex-1" />
              <button type="button" onClick={() => setAmount(String(Math.round(balance)))}
                className="px-3 py-2 rounded-lg text-xs font-bold border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-dim)]">
                Full
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider">Method</label>
            <div className="flex gap-2 mt-1">
              {['cash', 'bank'].map(m => (
                <button key={m} type="button" onClick={() => setMethod(m)}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold capitalize"
                  style={{
                    background: method === m ? 'var(--accent)' : 'var(--surface-2)',
                    color: method === m ? '#fff' : 'var(--text-dim)',
                    border: `1px solid ${method === m ? 'var(--accent)' : 'var(--border)'}`,
                  }}>
                  {m === 'bank' ? 'Bank Transfer' : 'Cash'}
                </button>
              ))}
            </div>
          </div>

          <input style={INP} placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />

          {error && <div className="text-xs text-[var(--bad-text)]">{error}</div>}

          <button type="submit" disabled={saving}
            className="w-full py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2"
            style={{ background: 'var(--accent)', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Record Payment'}
          </button>
        </form>
      </div>
    </div>
  )
}

// Distinct from "Record Payment" on purpose — this never touches cash. It
// corrects what a distributor branch actually owes (a write-off, a goodwill
// discount, fixing a wrong quantity/price at the time of shipment), so it
// changes the order's total rather than pretending a payment came in.
function AdjustBalanceModal({ item, onClose, onSaved, adjustedBy }) {
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const deltaNum = parseFloat(delta) || 0
  const newBalance = Math.max(0, (parseFloat(item.balance) || 0) + deltaNum)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!deltaNum) { setError('Enter a non-zero amount'); return }
    if (!reason.trim()) { setError('A reason is required'); return }
    setSaving(true)
    try {
      const res = await window.api.distributorOrderAdjustBalance(item.id, deltaNum, reason.trim(), adjustedBy)
      if (!res?.success) throw new Error(res?.error || 'Failed to adjust balance')
      toast.success(`Balance adjusted — now ${rs(res.balance)} outstanding`)
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  const INP = {
    width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '9px 12px', fontSize: 13, color: 'var(--text)', outline: 'none',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-[var(--surface-2)]">
          <div>
            <div className="font-bold text-[var(--text)]">Adjust Outstanding Balance</div>
            <div className="text-xs text-[var(--text-faint)] mt-0.5">{item.ref_number} · {item.party_name}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-faint)] hover:bg-[var(--surface-3)]">
            <Icon name="x" size={14} sw={2.2} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <div className="text-xs" style={{ color: 'var(--text-faint)' }}>
            This changes what the distributor owes — it does not record a payment. Use a negative amount to write off part of the balance, or positive to correct an undercharge.
          </div>
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm">
            <div><div className="text-xs text-[var(--text-faint)]">Current Balance</div><div className="mono font-bold">{rs(item.balance)}</div></div>
            <div><div className="text-xs text-[var(--text-faint)]">New Balance</div><div className="mono font-bold" style={{ color: 'var(--accent-text)' }}>{rs(newBalance)}</div></div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider">Adjustment Amount</label>
            <input style={{ ...INP, fontFamily: 'var(--font-mono)' }} type="number" step="1" className="mt-1"
              value={delta} onChange={e => setDelta(e.target.value)} placeholder="e.g. -500 to write off Rs 500" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider">Reason *</label>
            <input style={INP} className="mt-1" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. damaged in transit, goodwill discount, entry correction" />
          </div>
          {error && <div className="text-xs text-[var(--bad-text)]">{error}</div>}
          <button type="submit" disabled={saving}
            className="w-full py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2"
            style={{ background: 'var(--warn)', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Adjust Balance'}
          </button>
        </form>
      </div>
    </div>
  )
}

// A distributor branch reported "we paid you X" from their own POS app — it
// hasn't touched any balance yet (see payment_claims' schema comment). Confirm
// runs the exact same balance update the manual "Record Payment" button below
// does; Reject just closes it out with no changes, for a duplicate/mistaken claim.
function PendingClaimsSection({ claims, onChanged, confirmedBy }) {
  const [busyId, setBusyId] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')

  if (!claims.length) return null

  async function confirm(claim) {
    setBusyId(claim.id)
    try {
      const res = await window.api.paymentClaimConfirm(claim.id, confirmedBy)
      if (!res?.success) throw new Error(res?.error || 'Failed to confirm')
      toast.success(`Confirmed — ${claim.distributor_name}'s balance updated`)
      onChanged?.()
    } catch (err) {
      toast.error(err.message || 'Failed to confirm')
    }
    setBusyId(null)
  }

  async function reject(claim) {
    setBusyId(claim.id)
    try {
      const res = await window.api.paymentClaimReject(claim.id, confirmedBy, reason)
      if (!res?.success) throw new Error(res?.error || 'Failed to reject')
      toast.success('Claim rejected')
      setRejecting(null); setReason('')
      onChanged?.()
    } catch (err) {
      toast.error(err.message || 'Failed to reject')
    }
    setBusyId(null)
  }

  return (
    <div className="bg-[var(--surface)] border-2 rounded-xl overflow-hidden" style={{ borderColor: 'rgba(245,158,11,0.4)' }}>
      <div className="flex items-center gap-2.5 px-5 py-3.5" style={{ background: 'var(--warn-soft)' }}>
        <Icon name="alert" size={15} sw={2} style={{ color: 'var(--warn-text)' }} />
        <div className="text-sm font-bold" style={{ color: 'var(--warn-text)' }}>
          {claims.length} payment claim{claims.length !== 1 ? 's' : ''} awaiting your confirmation
        </div>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {claims.map(c => (
          <div key={c.id} className="px-5 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--text)]">{c.distributor_name} · {c.order_number}</div>
                <div className="text-xs text-[var(--text-faint)] mt-0.5">
                  Reported {c.submitted_at?.slice(0, 16).replace('T', ' ')} · {c.payment_method}{c.notes ? ` · ${c.notes}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="mono font-bold text-[var(--text)]">Rs {Math.round(c.amount).toLocaleString('en-PK')}</span>
                <button onClick={() => confirm(c)} disabled={busyId === c.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: 'var(--ok)', opacity: busyId === c.id ? 0.7 : 1 }}>
                  Confirm
                </button>
                <button onClick={() => setRejecting(rejecting === c.id ? null : c.id)} disabled={busyId === c.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'var(--bad-soft)', color: 'var(--bad-text)' }}>
                  Reject
                </button>
              </div>
            </div>
            {rejecting === c.id && (
              <div className="flex items-center gap-2 mt-3">
                <input autoFocus className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs"
                  placeholder="Reason (e.g. duplicate, wrong amount)…" value={reason} onChange={e => setReason(e.target.value)} />
                <button onClick={() => reject(c)} disabled={busyId === c.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex-shrink-0" style={{ background: 'var(--bad)' }}>
                  Confirm Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DuePaymentsPanel({ orgId, includeSupply = true }) {
  const { user } = useAuth()
  const [dues, setDues] = useState([])
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [adjusting, setAdjusting] = useState(null)
  const [paymentHistory, setPaymentHistory] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.api.duesGet(orgId, includeSupply)
      setDues(res?.data || [])
      if (includeSupply) {
        const claimsRes = await window.api.paymentClaimsGetPending(orgId)
        setClaims(claimsRes?.success ? claimsRes.data : [])
      }
    } catch {}
    setLoading(false)
  }, [orgId, includeSupply])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!selected) { setPaymentHistory([]); return }
    async function loadHistory() {
      const params = selected.source === 'sale'
        ? { invoiceId: selected.id }
        : { supplyOrderId: selected.id }
      const res = await window.api.paymentsGet(params)
      setPaymentHistory(res?.data || [])
    }
    loadHistory()
  }, [selected])

  const today = new Date().toISOString().slice(0, 10)
  const totalDue = dues.reduce((s, d) => s + (parseFloat(d.balance) || 0), 0)
  const overdueCount = dues.filter(d => d.due_date && d.due_date <= today).length

  const filtered = dues.filter(d => {
    const q = search.toLowerCase()
    if (q && !d.party_name?.toLowerCase().includes(q) && !d.ref_number?.toLowerCase().includes(q)) return false
    if (filter === 'overdue') return d.due_date && d.due_date <= today
    if (filter === 'retail') return d.source === 'sale' && d.sale_type === 'retail'
    if (filter === 'wholesale') return d.source === 'sale' && d.sale_type === 'wholesale'
    if (filter === 'distributor') return d.source === 'supply'
    return true
  })

  const inp = 'w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]'

  return (
    <div className="flex flex-col gap-4">
      <PendingClaimsSection claims={claims} onChanged={load} confirmedBy={user?.name || user?.email || ''} />

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest">Total Outstanding</div>
          <div className="text-2xl font-extrabold mono text-[var(--bad-text)] mt-2">{rs(totalDue)}</div>
          <div className="text-xs text-[var(--text-faint)] mt-1">{dues.length} open account{dues.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest">Overdue</div>
          <div className="text-2xl font-extrabold mono text-[var(--bad-text)] mt-2">{overdueCount}</div>
          <div className="text-xs text-[var(--text-faint)] mt-1">Past due date — call to collect</div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest">Partial Payments</div>
          <div className="text-2xl font-extrabold mono text-[var(--info-text)] mt-2">
            {dues.filter(d => d.payment_status === 'partial').length}
          </div>
          <div className="text-xs text-[var(--text-faint)] mt-1">Accounts with some payment received</div>
        </div>
      </div>

      {includeSupply && (
        <div className="text-xs text-[var(--text-faint)] px-1">
          "Record Payment" below enters cash/bank you collected yourself — a distributor branch reporting its own payment from their POS app shows up as a pending claim above instead, and only updates the balance once you confirm it.
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        {[
          { id: 'all', label: 'All' },
          { id: 'overdue', label: 'Overdue' },
          { id: 'retail', label: 'Retail' },
          { id: 'wholesale', label: 'Wholesale' },
          ...(includeSupply ? [{ id: 'distributor', label: 'Distributor Supply' }] : []),
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{
              background: filter === f.id ? 'var(--accent)' : 'var(--surface-2)',
              color: filter === f.id ? '#fff' : 'var(--text-dim)',
              border: `1px solid ${filter === f.id ? 'var(--accent)' : 'var(--border)'}`,
            }}>
            {f.label}
          </button>
        ))}
        <div className="relative flex-1 min-w-[200px] ml-auto">
          <Icon name="search" size={14} sw={2} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
          <input className={inp + ' pl-8'} placeholder="Search customer or invoice…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : !filtered.length ? (
          <div className="flex flex-col items-center py-16 gap-3 text-[var(--text-faint)]">
            <Icon name="check" size={32} sw={1.5} />
            <span className="text-sm">No outstanding payments</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                  {['Reference', 'Party', 'Phone', 'Type', 'Total', 'Paid', 'Balance', 'Due Date', 'Status', ''].map((h, i) => (
                    <th key={i} className="text-left py-2.5 px-4 text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider first:pl-5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map((d, i) => {
                  const isOverdue = d.due_date && d.due_date <= today
                  return (
                    <tr key={i} className="hover:bg-[var(--surface-2)] transition-colors"
                      style={isOverdue ? { background: 'rgba(239,68,68,0.04)' } : undefined}>
                      <td className="py-3 px-4 pl-5 mono text-xs font-semibold text-[var(--accent-text)]">{d.ref_number}</td>
                      <td className="py-3 px-4 font-semibold text-[var(--text)]">{d.party_name}</td>
                      <td className="py-3 px-4 text-xs text-[var(--text-dim)]">{d.party_phone || '—'}</td>
                      <td className="py-3 px-4 text-xs capitalize text-[var(--text-dim)]">
                        {d.source === 'supply' ? 'Distributor' : d.sale_type || 'retail'}
                      </td>
                      <td className="py-3 px-4 mono text-[var(--text)]">{rs(d.total_amount)}</td>
                      <td className="py-3 px-4 mono text-[var(--ok-text)]">{rs(d.amount_paid)}</td>
                      <td className="py-3 px-4 mono font-bold text-[var(--bad-text)]">{rs(d.balance)}</td>
                      <td className="py-3 px-4 mono text-xs" style={{ color: isOverdue ? 'var(--bad-text)' : 'var(--text-dim)' }}>
                        {d.due_date || '—'}
                        {isOverdue && <span className="ml-1 font-bold">!</span>}
                      </td>
                      <td className="py-3 px-4"><DueStatusBadge status={d.payment_status} dueDate={d.due_date} /></td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setSelected(d)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                            style={{ background: 'var(--accent)' }}>
                            Record Payment
                          </button>
                          {d.source === 'supply' && (
                            <button onClick={() => setAdjusting(d)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold"
                              style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)' }}>
                              Adjust Balance
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <RecordPaymentModal
          item={selected}
          onClose={() => setSelected(null)}
          onSaved={load}
        />
      )}
      {adjusting && (
        <AdjustBalanceModal
          item={adjusting}
          adjustedBy={user?.name || user?.email || ''}
          onClose={() => setAdjusting(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}

export { defaultDueDate, rs as formatRs, DueStatusBadge }
