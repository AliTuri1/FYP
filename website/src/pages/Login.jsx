import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase, REMEMBER_ME_KEY } from '../lib/supabase'
import { Icon, Spinner } from '../components/DesignSystem'

export default function Login() {
  const { signIn, user } = useAuth()
  const navigate = useNavigate()

  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [showPwd,     setShowPwd]     = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [emailFocus,  setEmailFocus]  = useState(false)
  const [passFocus,   setPassFocus]   = useState(false)
  const [btnHover,    setBtnHover]    = useState(false)
  const [btnActive,   setBtnActive]   = useState(false)
  const [rememberMe,  setRememberMe]  = useState(() => localStorage.getItem(REMEMBER_ME_KEY) !== '0')

  useEffect(() => { if (user) navigate('/') }, [user, navigate])

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        // RLS blocks anonymous reads of `users` directly, so this uses a
        // SECURITY DEFINER RPC that only answers "does at least one user exist".
        const { data: anyUsers, error } = await supabase.rpc('has_any_users')
        if (!error && anyUsers === false) navigate('/first-time-setup')
      } catch {}
    }, 500)
    return () => clearTimeout(timer)
  }, [navigate])

  const handleLogin = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    // Must be set before signIn() — the Supabase client checks this flag at the
    // moment it persists the new session, to decide localStorage vs sessionStorage.
    localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? '1' : '0')
    const { error: err } = await signIn(email, password)
    setLoading(false)
    if (err) setError(err.message || 'Invalid credentials')
    else navigate('/')
  }

  const canSubmit = !loading && email && password

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      fontFamily: 'var(--font-ui)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: '10%', left: '25%',
        width: 480, height: 480, borderRadius: 9999,
        background: 'radial-gradient(circle, rgba(13,148,136,0.12) 0%, transparent 70%)',
        filter: 'blur(40px)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '5%', right: '20%',
        width: 340, height: 340, borderRadius: 9999,
        background: 'radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 70%)',
        filter: 'blur(40px)', pointerEvents: 'none',
      }} />

      <div
        className="pop"
        style={{
          width: '100%', maxWidth: 400,
          position: 'relative', zIndex: 1,
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border)',
          borderRadius: 20,
          boxShadow: 'var(--shadow-xl)',
          padding: '36px 36px 32px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 15, flexShrink: 0,
            background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 60%, #0F766E 100%)',
            display: 'grid', placeItems: 'center',
            boxShadow: '0 8px 24px rgba(20,184,166,0.4)',
          }}>
            <Icon name="zap" size={26} sw={2.2} style={{ color: '#fff' }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', fontFamily: 'var(--font-title)', lineHeight: 1 }}>
              Sameer Battery House
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: '.1em', textTransform: 'uppercase', marginTop: 3, fontWeight: 700 }}>
              Solar POS · v1.0
            </div>
          </div>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 6, letterSpacing: '.04em', textTransform: 'uppercase' }}>
              Email
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@solarpos.local"
              onFocus={() => setEmailFocus(true)}
              onBlur={() => setEmailFocus(false)}
              style={{
                width: '100%', height: 44, padding: '0 14px',
                fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '0.02em',
                background: 'var(--surface)', color: 'var(--text)',
                border: emailFocus ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
                borderRadius: 10, outline: 'none',
                boxShadow: emailFocus ? 'var(--ring)' : 'none',
                transition: 'border-color .15s, box-shadow .15s',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 6, letterSpacing: '.04em', textTransform: 'uppercase' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPwd ? 'text' : 'password'}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                onFocus={() => setPassFocus(true)}
                onBlur={() => setPassFocus(false)}
                style={{
                  width: '100%', height: 44, padding: '0 44px 0 14px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: showPwd ? 13 : 16,
                  letterSpacing: showPwd ? '0.02em' : '0.2em',
                  background: 'var(--surface)', color: 'var(--text)',
                  border: passFocus ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
                  borderRadius: 10, outline: 'none',
                  boxShadow: passFocus ? 'var(--ring)' : 'none',
                  transition: 'border-color .15s, box-shadow .15s',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPwd(s => !s)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                  display: 'grid', placeItems: 'center', outline: 'none',
                }}
              >
                <Icon name="eye" size={16} sw={1.8} style={{ color: showPwd ? 'var(--accent)' : 'var(--text-faint)' }} />
              </button>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={e => setRememberMe(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 12.5, color: 'var(--text-dim)', fontWeight: 600 }}>Remember me</span>
          </label>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 13px', borderRadius: 9,
              background: 'var(--bad-soft)', border: '1px solid rgba(220,38,38,0.2)',
              fontSize: 12.5, fontWeight: 600, color: 'var(--bad-text)',
              animation: 'shake 0.3s',
            }}>
              <Icon name="alert" size={14} sw={2} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            onMouseEnter={() => setBtnHover(true)}
            onMouseLeave={() => { setBtnHover(false); setBtnActive(false) }}
            onMouseDown={() => setBtnActive(true)}
            onMouseUp={() => setBtnActive(false)}
            style={{
              marginTop: 4,
              height: 46, borderRadius: 10, border: 'none',
              background: canSubmit
                ? (btnHover ? 'var(--accent-hover)' : 'var(--accent)')
                : 'var(--surface-3)',
              color: canSubmit ? '#fff' : 'var(--text-faint)',
              fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em',
              cursor: canSubmit ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transform: btnActive && canSubmit ? 'scale(0.97)' : 'scale(1)',
              transition: 'background-color .15s, transform .1s, color .15s',
              outline: 'none',
              boxShadow: canSubmit ? '0 4px 14px rgba(13,148,136,0.3)' : 'none',
            }}
          >
            {loading
              ? <><Spinner size={15} color="rgba(255,255,255,0.8)" /> Signing in…</>
              : <><Icon name="arrow" size={16} sw={2.2} /> Sign In</>
            }
          </button>
        </form>
      </div>

      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%,60%  { transform: translateX(-5px); }
          40%,80%  { transform: translateX(5px); }
        }
      `}</style>
    </div>
  )
}
