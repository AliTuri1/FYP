import { useState, useEffect } from 'react'
import { Icon } from './DesignSystem'

function rs(n) {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0)
  if (isNaN(num)) return 'Rs 0'
  return `Rs ${Math.round(num).toLocaleString('en-PK')}`
}

export default function DueAlertBanner({ orgId, onViewDues }) {
  const [overdue, setOverdue] = useState([])
  const [dueSoon, setDueSoon] = useState([])
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!orgId || !window.api?.duesGetOverdue) return
    let cancelled = false

    async function load() {
      try {
        const [overdueRes, duesRes] = await Promise.all([
          window.api.duesGetOverdue(orgId),
          window.api.duesGet(orgId, true),
        ])
        if (cancelled) return

        const today = new Date().toISOString().slice(0, 10)
        const soon = new Date()
        soon.setDate(soon.getDate() + 3)
        const soonStr = soon.toISOString().slice(0, 10)

        setOverdue(overdueRes?.data || [])
        const allOpen = duesRes?.data || []
        setDueSoon(allOpen.filter(d => d.due_date && d.due_date > today && d.due_date <= soonStr))
      } catch {}
    }

    load()
    const id = setInterval(load, 60000)
    return () => { cancelled = true; clearInterval(id) }
  }, [orgId])

  if (dismissed || (!overdue.length && !dueSoon.length)) return null

  const totalOverdue = overdue.reduce((s, d) => s + (parseFloat(d.balance) || 0), 0)
  const isCritical = overdue.length > 0

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-xl border text-sm mb-4"
      style={{
        background: isCritical ? 'var(--bad-soft)' : 'var(--warn-soft)',
        borderColor: isCritical ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)',
        color: isCritical ? 'var(--bad-text)' : 'var(--warn-text)',
      }}
    >
      <Icon name="alert" size={18} sw={2} style={{ flexShrink: 0, marginTop: 1 }} />
      <div className="flex-1 min-w-0">
        {isCritical ? (
          <>
            <div className="font-bold">
              {overdue.length} payment{overdue.length > 1 ? 's' : ''} overdue — {rs(totalOverdue)} outstanding
            </div>
            <div className="text-xs mt-1 opacity-90">
              {overdue.slice(0, 3).map(d => d.party_name).join(' · ')}
              {overdue.length > 3 ? ` · +${overdue.length - 3} more` : ''}
              {' — '}
              Call customers to collect payment.
            </div>
          </>
        ) : (
          <>
            <div className="font-bold">
              {dueSoon.length} payment{dueSoon.length > 1 ? 's' : ''} due within 3 days
            </div>
            <div className="text-xs mt-1 opacity-90">
              {dueSoon.slice(0, 3).map(d => `${d.party_name} (${d.due_date})`).join(' · ')}
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {onViewDues && (
          <button
            onClick={onViewDues}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
            style={{ background: isCritical ? 'var(--bad)' : 'var(--warn)' }}
          >
            View Dues
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="w-7 h-7 rounded-lg flex items-center justify-center opacity-70 hover:opacity-100"
          aria-label="Dismiss"
        >
          <Icon name="x" size={12} sw={2.5} />
        </button>
      </div>
    </div>
  )
}
