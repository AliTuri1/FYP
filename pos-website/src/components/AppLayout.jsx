import { useState, useEffect } from 'react'
import { Icon } from './DesignSystem'
import { useAuth } from '../contexts/AuthContext'

export default function AppLayout({ children, currentView, onViewChange, navItems }) {
  const { user, signOut } = useAuth()
  const [theme, setTheme] = useState(localStorage.getItem('solarpos_theme') || 'light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('solarpos_theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  const initials = (user?.name || 'U')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  const roleLabel = {
    super_admin:      'Super Admin',
    distributor_user: 'Distributor Staff',
    sales_user:       'Salesman',
  }[user?.role] || 'User'

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)', fontFamily: 'var(--font-ui)', transition: 'background-color .3s' }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside style={{
        width: 232,
        flexShrink: 0,
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--sidebar-border, var(--border))',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        transition: 'background-color .3s, border-color .3s',
      }}>
        {/* Top teal accent glow */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, #14B8A6 0%, #0D9488 60%, transparent 100%)',
          pointerEvents: 'none',
        }} />

        {/* Brand */}
        <div style={{ padding: '14px 16px 12px', display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 60%, #0F766E 100%)',
            display: 'grid', placeItems: 'center', flexShrink: 0,
            boxShadow: '0 4px 12px rgba(20,184,166,0.3)',
          }}>
            <Icon name="zap" size={18} sw={2} style={{ color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--sidebar-text-active)', letterSpacing: '-0.02em', fontFamily: 'var(--font-title)' }}>
              Sameer Battery House
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--sidebar-text)', letterSpacing: '.08em', marginTop: 1, fontWeight: 700 }}>
              POS & Inventory
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--sidebar-border, var(--border))', margin: '0 16px 8px' }} />

        {/* Nav */}
        {navItems && navItems.length > 0 && (
          <nav style={{
            padding: '0 10px 8px', display: 'flex', flexDirection: 'column', gap: 3,
            flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
          }}>
            {navItems.map(n => {
              const childIds = n.children?.map(c => c.id) || [n.id]
              const active = childIds.includes(currentView)
              return (
                <button
                  key={n.id}
                  onClick={() => onViewChange(active ? currentView : childIds[0])}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 10px',
                    borderRadius: 9,
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all .25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                    background: active ? 'var(--sidebar-active)' : 'transparent',
                    position: 'relative',
                    outline: 'none',
                    flexShrink: 0,
                    boxShadow: active ? '0 4px 12px rgba(13,148,136,0.15)' : 'none',
                    transform: active ? 'translateX(2px)' : 'translateX(0)',
                  }}
                  onMouseEnter={e => {
                    if (!active) {
                      e.currentTarget.style.background = 'var(--sidebar-hover)'
                      e.currentTarget.style.transform = 'translateX(4px)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.transform = 'translateX(0)'
                    }
                  }}
                >
                  {active && (
                    <span style={{
                      position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                      width: 3.5, height: '60%', borderRadius: '0 4px 4px 0',
                      background: 'var(--accent)',
                    }} />
                  )}
                  <span style={{
                    display: 'grid', placeItems: 'center',
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: active ? 'rgba(13,148,136,0.12)' : 'var(--surface-2)',
                    color: active ? 'var(--accent)' : 'var(--text-faint)',
                    transition: 'background .15s, color .15s',
                  }}>
                    <Icon name={n.icon} size={16} sw={2} />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: 13.5, fontWeight: active ? 700 : 500,
                      color: active ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
                      whiteSpace: 'nowrap', lineHeight: 1.2,
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      {n.label}
                      {n.badge > 0 && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, minWidth: 15, height: 15,
                          borderRadius: 99, background: '#ef4444', color: '#fff',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          padding: '0 3px', lineHeight: 1,
                        }}>{n.badge}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 1, whiteSpace: 'nowrap' }}>
                      {n.sub}
                    </div>
                  </div>
                </button>
              )
            })}
          </nav>
        )}

        {/* User row */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 10px', display: 'flex', alignItems: 'center', gap: 9, transition: 'border-color .3s' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 99, flexShrink: 0,
            background: 'linear-gradient(135deg, #14B8A6, #0D9488)',
            display: 'grid', placeItems: 'center',
            fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: '.01em',
          }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sidebar-text-active)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name || 'User'}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--sidebar-text)' }}>{roleLabel}</div>
          </div>
          
          {/* Theme Switcher Button */}
          <button
            onClick={toggleTheme}
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              display: 'grid', placeItems: 'center', cursor: 'pointer',
              color: 'var(--text-dim)', flexShrink: 0, transition: 'background .15s, color .15s, transform .1s',
              outline: 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-dim)' }}
          >
            {theme === 'light' ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            )}
          </button>

          {/* Sign Out Button */}
          <button
            onClick={handleLogout}
            title="Sign out"
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              display: 'grid', placeItems: 'center', cursor: 'pointer',
              color: 'var(--text-faint)', flexShrink: 0, transition: 'background .15s, color .15s, transform .1s',
              outline: 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bad-soft)'; e.currentTarget.style.color = 'var(--bad-text)'; e.currentTarget.style.borderColor = 'transparent' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-faint)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <Icon name="x" size={13} sw={2.2} />
          </button>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Header */}
        {(() => {
          const group = navItems?.find(n => n.children ? n.children.some(c => c.id === currentView) : n.id === currentView)
          if (!group) return null
          const leaf = group.children?.find(c => c.id === currentView) || group
          return (
            <header style={{
              flexShrink: 0,
              background: 'var(--glass-bg)',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              borderBottom: '1px solid var(--border)',
              position: 'sticky', top: 0, zIndex: 40,
              transition: 'background-color .3s, border-color .3s',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 var(--pad)', height: 58 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: 'var(--accent-soft)',
                  display: 'grid', placeItems: 'center',
                }}>
                  <Icon name={leaf.icon} size={15} sw={2} style={{ color: 'var(--accent)' }} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text)', lineHeight: 1.1, fontFamily: 'var(--font-title)' }}>
                    {leaf.label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{group.sub}</div>
                </div>
              </div>

              {group.children && group.children.length > 1 && (
                <div style={{ display: 'flex', gap: 6, padding: '0 var(--pad) 10px', overflowX: 'auto' }}>
                  {group.children.map(c => {
                    const active = c.id === currentView
                    return (
                      <button
                        key={c.id}
                        onClick={() => onViewChange(c.id)}
                        style={{
                          flexShrink: 0,
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '5px 12px',
                          borderRadius: 99,
                          border: '1px solid ' + (active ? 'transparent' : 'var(--border)'),
                          background: active ? 'var(--accent)' : 'var(--surface-2)',
                          color: active ? '#fff' : 'var(--text-faint)',
                          fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', outline: 'none',
                          transition: 'background .15s, color .15s',
                        }}
                      >
                        <Icon name={c.icon} size={12} sw={2} />
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </header>
          )
        })()}

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 'var(--pad)' }} className="pop">
          {children}
        </main>
      </div>
    </div>
  )
}
