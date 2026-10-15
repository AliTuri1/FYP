import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { Icon, Spinner } from '../components/DesignSystem'

export default function FirstTimeSetup() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const set = (k, v) => setFormData(p => ({ ...p, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    if (!formData.name || !formData.email || !formData.password) {
      toast.error('All fields are required')
      return
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    try {
      setLoading(true)

      // Creates the main organization + first super_admin server-side (the
      // admin-user-actions Edge Function's 'bootstrap' action). It refuses once
      // any user exists, so this page can't be used to mint a second admin.
      const { data, error } = await supabase.functions.invoke('admin-user-actions', {
        body: { action: 'bootstrap', name: formData.name, email: formData.email, password: formData.password },
      })
      if (error) {
        throw new Error(`Could not reach the setup service: ${error.message}. Make sure the admin-user-actions Edge Function is deployed.`)
      }
      if (!data?.success) throw new Error(data?.error || 'Setup failed')

      toast.success('Admin account created!')
      const { error: signInError } = await signIn(formData.email, formData.password)
      if (signInError) throw new Error(signInError.message || 'Account created — please sign in.')
      navigate('/')
    } catch (err) {
      toast.error(err.message || 'Error creating account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex', height: '100vh',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', fontFamily: 'var(--font-ui)',
      overflow: 'hidden', position: 'relative',
    }}>

      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: '15%', left: '30%',
        width: 400, height: 400, borderRadius: 9999,
        background: 'radial-gradient(circle, rgba(13,148,136,0.1) 0%, transparent 70%)',
        filter: 'blur(50px)', pointerEvents: 'none',
      }} />

      <div className="pop" style={{
        width: '100%', maxWidth: 420,
        position: 'relative', zIndex: 1,
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--glass-border)',
        borderRadius: 20,
        boxShadow: 'var(--shadow-xl)',
        padding: '36px 36px 32px',
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 15,
            background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 60%, #0F766E 100%)',
            display: 'grid', placeItems: 'center',
            boxShadow: '0 8px 24px rgba(20,184,166,0.4)',
          }}>
            <Icon name="zap" size={26} sw={2.2} style={{ color: '#fff' }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', fontFamily: 'var(--font-title)' }}>
              Sameer Battery House
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 2, fontWeight: 700 }}>
              First-Time Setup
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {[
            { key: 'name',            label: 'Full Name',        type: 'text',     ph: 'Administrator Name' },
            { key: 'email',           label: 'Email',            type: 'email',    ph: 'admin@company.com'  },
            { key: 'password',        label: 'Password',         type: 'password', ph: '••••••••'           },
            { key: 'confirmPassword', label: 'Confirm Password', type: 'password', ph: '••••••••'           },
          ].map(f => (
            <div key={f.key}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 6, letterSpacing: '.04em', textTransform: 'uppercase' }}>
                {f.label}
              </label>
              <input
                type={f.type}
                required
                placeholder={f.ph}
                value={formData[f.key]}
                onChange={e => set(f.key, e.target.value)}
                style={{
                  width: '100%', height: 44, padding: '0 14px',
                  background: 'var(--surface)', color: 'var(--text)',
                  border: '1.5px solid var(--border)', borderRadius: 10,
                  fontSize: 13, fontFamily: 'var(--font-mono)',
                  outline: 'none', transition: 'border-color .15s, box-shadow .15s',
                }}
                onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = 'var(--ring)' }}
                onBlur={e  => { e.target.style.borderColor = 'var(--border)';  e.target.style.boxShadow = 'none'      }}
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 6,
              height: 46, borderRadius: 10, border: 'none',
              background: loading ? 'var(--surface-3)' : 'var(--accent)',
              color: loading ? 'var(--text-faint)' : '#fff',
              fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em',
              cursor: loading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background-color .15s, transform .1s',
              outline: 'none',
              boxShadow: loading ? 'none' : '0 4px 14px rgba(13,148,136,0.3)',
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--accent-hover)' }}
            onMouseLeave={e => { if (!loading) e.currentTarget.style.background = 'var(--accent)' }}
          >
            {loading
              ? <><Spinner size={15} color="rgba(255,255,255,0.8)" /> Creating account…</>
              : <><Icon name="arrow" size={16} sw={2.2} /> Create Admin Account</>
            }
          </button>
        </form>

        {/* Info note */}
        <div style={{
          marginTop: 20, padding: '12px 14px', borderRadius: 10,
          background: 'var(--accent-soft)', border: '1px solid rgba(13,148,136,0.15)',
        }}>
          <div style={{ fontSize: 11.5, color: 'var(--accent-text)', lineHeight: 1.55 }}>
            This admin account manages all distributors, inventory, and staff.
          </div>
        </div>
      </div>
    </div>
  )
}
