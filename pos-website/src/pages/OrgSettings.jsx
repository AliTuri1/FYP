import { useState, useEffect } from 'react'
import { Icon, Spinner } from '../components/DesignSystem'
import toast from 'react-hot-toast'

const INP = {
  width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '9px 12px', fontSize: 13, color: 'var(--text)',
  outline: 'none', fontFamily: 'var(--font-ui)', transition: 'border-color .15s',
}
const LBL = { fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5, display: 'block' }

export default function OrgSettings({ orgId }) {
  const [form, setForm]     = useState(null)
  const [loading, setLoad]  = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty]   = useState(false)

  useEffect(() => {
    if (!orgId) return
    window.api.orgSettingsGet(orgId)
      .then(res => {
        if (res.success) setForm(res.data)
      })
      .catch(() => {})
      .finally(() => setLoad(false))
  }, [orgId])

  function update(key, val) {
    setForm(f => ({ ...f, [key]: val }))
    setDirty(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await window.api.orgSettingsSave({ ...form, org_id: orgId })
      if (!res.success) throw new Error(res.error)
      toast.success('Settings saved')
      setDirty(false)
    } catch (err) { toast.error(err.message) }
    setSaving(false)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
  if (!form)   return <div style={{ color: 'var(--text-faint)', padding: 24 }}>Could not load settings.</div>

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 700 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Business / Receipt Settings</div>
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>
          This information appears on every printed invoice and PDF receipt.
        </div>
      </div>

      {/* Preview strip */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center' }}>
          <Icon name="doc" size={20} sw={1.8} style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{form.business_name || '—'}</div>
          {form.tagline && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 1 }}>{form.tagline}</div>}
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
            {[form.phone1, form.phone2].filter(Boolean).join(' · ')}
            {form.city && ` · ${form.city}`}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic' }}>Receipt preview</div>
      </div>

      {/* Form */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={LBL}>Business Name *</label>
            <input style={INP} value={form.business_name} onChange={e => update('business_name', e.target.value)} placeholder="e.g. Sameer Battery House" />
          </div>
          <div>
            <label style={LBL}>Primary Phone</label>
            <input style={{ ...INP, fontFamily: 'var(--font-mono)' }} value={form.phone1} onChange={e => update('phone1', e.target.value)} placeholder="0300-1234567" />
          </div>
          <div>
            <label style={LBL}>Secondary Phone (optional)</label>
            <input style={{ ...INP, fontFamily: 'var(--font-mono)' }} value={form.phone2} onChange={e => update('phone2', e.target.value)} placeholder="0321-7654321" />
          </div>
          <div>
            <label style={LBL}>City</label>
            <input style={INP} value={form.city} onChange={e => update('city', e.target.value)} placeholder="e.g. Lahore" />
          </div>
          <div>
            <label style={LBL}>Address</label>
            <input style={INP} value={form.address} onChange={e => update('address', e.target.value)} placeholder="Shop #5, Main Market…" />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={LBL}>Tagline (shown under business name)</label>
            <input style={INP} value={form.tagline} onChange={e => update('tagline', e.target.value)} placeholder="e.g. Solar Energy Products — Authorised Dealer" />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={LBL}>Receipt Footer Message</label>
            <input style={INP} value={form.receipt_footer} onChange={e => update('receipt_footer', e.target.value)} placeholder="Thank you for your business!" />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" disabled={saving || !dirty} style={{
          padding: '10px 24px', borderRadius: 9, fontSize: 13, fontWeight: 700,
          background: dirty ? 'var(--accent)' : 'var(--surface-3)',
          color: dirty ? '#fff' : 'var(--text-faint)',
          border: 'none', cursor: dirty ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', gap: 8, opacity: saving ? 0.7 : 1,
        }}>
          {saving && <Spinner />}
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        {dirty && (
          <button type="button" onClick={() => { setDirty(false); setForm(null); setLoad(true); window.api.orgSettingsGet(orgId).then(r => { if (r.success) setForm(r.data) }).finally(() => setLoad(false)) }}
            style={{ padding: '10px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-dim)', cursor: 'pointer' }}>
            Discard
          </button>
        )}
      </div>
    </form>
  )
}
