import { useState } from 'react'

// ─── Icons ────────────────────────────────────────────────────────────────────

const PATHS = {
  search:    'M11 11 L20 20 M13 7 A6 6 0 1 1 1 7 A6 6 0 0 1 13 7',
  plus:      'M11 4 V18 M4 11 H18',
  check:     'M4 11 l5 5 l10 -11',
  x:         'M5 5 L17 17 M17 5 L5 17',
  alert:     'M11 2 L21 19 H1 Z M11 9 V13 M11 16 v0.4',
  chev:      'M5 8 l6 6 l6 -6',
  zap:       'M12 2 L4 13 H11 L9 21 L18 9 H11 Z',
  box:       'M11 1 L20 6 V16 L11 21 L2 16 V6 Z M2 6 L11 11 L20 6 M11 11 V21',
  cart:      'M1 2 H4 L6 14 H17 L19 5 H6 M8 19 a1.4 1.4 0 1 0 0.1 0 M16 19 a1.4 1.4 0 1 0 0.1 0',
  ledger:    'M4 2 H15 L18 5 V20 H4 Z M7 7 H15 M7 11 H15 M7 15 H12',
  card:      'M1 5 H21 V17 H1 Z M1 9 H21',
  cash:      'M1 4 H21 V16 H1 Z M11 10 a2.4 2.4 0 1 0 0.1 0 M4 7 v6 M18 7 v6',
  user:      'M11 11 a4 4 0 1 0 -0.1 0 M3 21 c0 -5 16 -5 16 0',
  shield:    'M11 1 L20 4 V11 C20 17 11 21 11 21 C11 21 2 17 2 11 V4 Z M7 11 l3 3 l5 -6',
  trash:     'M3 5 H19 M8 5 V2 H14 V5 M5 5 V20 H17 V5 M9 9 V16 M13 9 V16',
  lock:      'M5 9 V6 a5 5 0 0 1 10 0 V9 M3 9 H17 V20 H3 Z M10 13 v3',
  arrow:     'M3 11 H18 M12 5 l7 6 l-7 6',
  doc:       'M5 2 H14 L18 6 V20 H5 Z M13 2 V7 H18',
  phone:     'M4 3 H8 L10 8 L7 10 a10 10 0 0 0 5 5 L14 12 L19 14 V18 a2 2 0 0 1 -2 2 A16 16 0 0 1 2 5 a2 2 0 0 1 2 -2 Z',
  clock:     'M11 11 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 M11 5 V11 L15 14',
  gauge:     'M2 16 a9 9 0 0 1 18 0 M11 16 L15 9',
  grid:      'M3 3 H9 V9 H3 Z M13 3 H19 V9 H13 Z M3 13 H9 V19 H3 Z M13 13 H19 V19 H13 Z',
  filter:    'M2 4 H20 L13 12 V19 L9 17 V12 Z',
  eye:       'M1 11 C4 5 18 5 21 11 C18 17 4 17 1 11 M11 11 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0',
  chart:     'M3 19 V11 H7 V19 M9 19 V5 H13 V19 M15 19 V13 H19 V19 M1 19 H21',
  star:      'M11 2 L13 8 L20 8 L15 12 L16 18 L11 15 L6 18 L7 12 L2 8 L9 8 Z',
  info:      'M11 11 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 M11 7 v1 M11 11 v5',
  download:  'M3 17 V20 H19 V17 M11 2 V14 M5 9 l6 6 l6 -6',
  lightning: 'M12 2 L4 13 H11 L9 21 L18 9 H11 Z',
  users:     'M8 10 a4 4 0 1 0 0.1 0 M1 20 c0-5 14-5 14 0 M15 9 a3 3 0 1 0 0.1 0 M13 18 c0-3.5 8-3.5 8 0',
  calendar:  'M4 5 H18 V19 H4 Z M4 9 H18 M8 3 V7 M14 3 V7 M7 13 h1.5 M11 13 h1.5 M15 13 h1.5 M7 16 h1.5 M11 16 h1.5',
  list:      'M4 6 H20 M4 11 H20 M4 16 H20',
  edit:      'M15 3 L19 7 L7 19 L2 20 L3 15 Z M15 3 L19 7',
  mail:      'M1 5 H21 V17 H1 Z M1 5 L11 12 L21 5',
  home:      'M2 10 L11 2 L20 10 V20 H14 V15 H8 V20 H2 Z',
  'arrow-up':   'M11 18 V4 M4 11 l7 -7 l7 7',
  'arrow-down': 'M11 4 V18 M4 11 l7 7 l7 -7',
  cloud:        'M17 18 a5 5 0 0 0 0 -10 h-1 A7 7 0 1 0 5 16 M11 14 V21 M7 18 l4 -4 l4 4',
}

export function Icon({ name, size = 18, sw = 1.8, style, className }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 22 22"
      fill="none" stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, display: 'block', ...style }}
    >
      <path d={PATHS[name] || ''} />
    </svg>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────

export function Badge({ tone = 'neutral', children, icon }) {
  const T = {
    neutral: { bg: 'var(--surface-3)',  color: 'var(--text-dim)',   border: 'var(--border)' },
    blue:    { bg: 'var(--accent-soft)', color: 'var(--accent-text)', border: 'rgba(20,184,166,0.15)' },
    green:   { bg: 'var(--ok-soft)',    color: 'var(--ok-text)',     border: 'rgba(16,185,129,0.15)' },
    yellow:  { bg: 'var(--warn-soft)',  color: 'var(--warn-text)',   border: 'rgba(245,158,11,0.15)' },
    red:     { bg: 'var(--bad-soft)',   color: 'var(--bad-text)',    border: 'rgba(239,68,68,0.15)' },
    teal:    { bg: 'var(--teal-soft)',  color: 'var(--teal-text)',   border: 'rgba(20,184,166,0.15)' },
  }[tone] || { bg: 'var(--surface-3)', color: 'var(--text-dim)', border: 'var(--border)' }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3.5px 10px', borderRadius: 99,
      background: T.bg, color: T.color,
      border: `1px solid ${T.border}`,
      fontSize: 11.5, fontWeight: 700, letterSpacing: '.015em',
      whiteSpace: 'nowrap',
    }}>
      {icon && <Icon name={icon} size={11} sw={2.2} />}
      {children}
    </span>
  )
}

// ─── Button ───────────────────────────────────────────────────────────────────

export function Btn({ kind = 'primary', size = 'md', icon, iconRight, children, style, ...rest }) {
  const [hov, setHov] = useState(false)
  const [act, setAct] = useState(false)

  const S = {
    sm: { h: 32, px: 12, fs: 12 },
    md: { h: 40, px: 16, fs: 13 },
    lg: { h: 46, px: 22, fs: 14 }
  }[size] || { h: 40, px: 16, fs: 13 }

  const K = {
    primary: {
      bg: hov ? 'var(--accent-hover)' : 'var(--accent)',
      fg: '#fff',
      bd: 'transparent',
      sh: 'var(--shadow-sm)'
    },
    soft: {
      bg: hov ? 'var(--surface-3)' : 'var(--surface-2)',
      fg: 'var(--text)',
      bd: 'var(--border)',
      sh: 'var(--shadow-xs)'
    },
    ghost: {
      bg: hov ? 'var(--surface-2)' : 'transparent',
      fg: 'var(--text)',
      bd: 'transparent',
      sh: 'none'
    },
    danger: {
      bg: hov ? 'var(--bad)' : 'var(--bad-soft)',
      fg: hov ? '#fff' : 'var(--bad-text)',
      bd: 'transparent',
      sh: 'none'
    },
    teal: {
      bg: hov ? 'var(--accent-hover)' : 'var(--accent)',
      fg: '#fff',
      bd: 'transparent',
      sh: 'var(--shadow-xs)'
    },
  }[kind] || {}

  return (
    <button
      {...rest}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setAct(false); }}
      onMouseDown={() => setAct(true)}
      onMouseUp={() => setAct(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        height: S.h, padding: `0 ${S.px}px`,
        fontSize: S.fs, fontWeight: 600,
        fontFamily: 'var(--font-ui)',
        background: K.bg, color: K.fg,
        border: `1px solid ${K.bd}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: K.sh,
        cursor: rest.disabled ? 'not-allowed' : 'pointer',
        opacity: rest.disabled ? 0.5 : 1,
        transform: act && !rest.disabled ? 'scale(0.96)' : 'scale(1)',
        transition: 'background .15s, box-shadow .15s, opacity .15s, transform .1s',
        whiteSpace: 'nowrap',
        letterSpacing: '-.01em',
        outline: 'none',
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={S.fs + 2} sw={2} />}
      {children}
      {iconRight && <Icon name={iconRight} size={S.fs + 2} sw={2} />}
    </button>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function Card({ title, sub, icon, accentColor, right, children, style, bodyStyle, noPad }) {
  return (
    <section style={{
      background: 'var(--glass-bg)',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      border: '1px solid var(--glass-border, var(--border))',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--glass-shadow, var(--shadow-sm))',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      transition: 'box-shadow .2s, border-color .2s',
      ...style,
    }}>
      {title && (
        <header style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(var(--surface-2), 0.3)',
        }}>
          {icon && (
            <span style={{
              width: 32, height: 32, borderRadius: 10, flexShrink: 0,
              background: accentColor ? `${accentColor}15` : 'var(--accent-soft)',
              color: accentColor || 'var(--accent)',
              display: 'grid', placeItems: 'center',
            }}>
              <Icon name={icon} size={16} sw={2} />
            </span>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', fontFamily: 'var(--font-title)', letterSpacing: '-0.015em' }}>{title}</div>
            {sub && <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>{sub}</div>}
          </div>
          {right && <div style={{ marginLeft: 'auto', flexShrink: 0 }}>{right}</div>}
        </header>
      )}
      <div style={{ padding: noPad ? 0 : 'var(--pad)', flex: 1, ...bodyStyle }}>
        {children}
      </div>
    </section>
  )
}

// ─── FieldLabel ───────────────────────────────────────────────────────────────

export function FieldLabel({ children, hint, required }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '.02em' }}>
        {children}
        {required && <span style={{ color: 'var(--bad)', marginLeft: 3 }}>*</span>}
      </label>
      {hint && <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{hint}</span>}
    </div>
  )
}

// ─── Input ────────────────────────────────────────────────────────────────────

export function Input({ label, hint, required, style, containerStyle, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={containerStyle}>
      {label && <FieldLabel hint={hint} required={required}>{label}</FieldLabel>}
      <input
        {...props}
        onFocus={e  => { setFocused(true); props.onFocus?.(e) }}
        onBlur={e   => { setFocused(false); props.onBlur?.(e) }}
        style={{
          width: '100%', height: 40,
          padding: '0 14px',
          background: 'var(--surface)',
          border: focused ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: focused ? 'var(--ring)' : 'none',
          color: 'var(--text)',
          fontSize: 13.5,
          outline: 'none',
          transition: 'border-color .15s, box-shadow .15s, background-color .15s',
          fontFamily: 'inherit',
          ...style,
        }}
      />
    </div>
  )
}

// ─── Select ───────────────────────────────────────────────────────────────────

export function Select({ label, hint, required, style, containerStyle, children, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={containerStyle}>
      {label && <FieldLabel hint={hint} required={required}>{label}</FieldLabel>}
      <select
        {...props}
        onFocus={e  => { setFocused(true); props.onFocus?.(e) }}
        onBlur={e   => { setFocused(false); props.onBlur?.(e) }}
        style={{
          width: '100%', height: 40,
          padding: '0 14px',
          background: 'var(--surface)',
          border: focused ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: focused ? 'var(--ring)' : 'none',
          color: 'var(--text)',
          fontSize: 13.5,
          outline: 'none',
          cursor: 'pointer',
          transition: 'border-color .15s, box-shadow .15s, background-color .15s',
          fontFamily: 'inherit',
          ...style,
        }}
      >
        {children}
      </select>
    </div>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

export function StatCard({ label, value, sub, color, iconBg, icon, IconSvg }) {
  const [hov, setHov] = useState(false)
  return (
    <div 
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--glass-border, var(--border))',
        borderRadius: 'var(--radius-lg)',
        padding: '18px 22px',
        boxShadow: hov ? 'var(--shadow-md)' : 'var(--glass-shadow, var(--shadow-sm))',
        display: 'flex', alignItems: 'center', gap: 16,
        transform: hov ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform .2s, box-shadow .2s, border-color .2s',
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: iconBg || 'var(--accent-soft)',
        display: 'grid', placeItems: 'center',
        transition: 'transform .2s',
        transform: hov ? 'scale(1.05)' : 'scale(1)',
      }}>
        {IconSvg || (icon && <Icon name={icon} size={20} sw={1.8} style={{ color: color || 'var(--accent)' }} />)}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5, whiteSpace: 'nowrap' }}>
          {label}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--text)', lineHeight: 1.1, letterSpacing: '-0.02em', fontFamily: 'var(--font-title)' }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, body }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      {icon && (
        <div style={{ marginBottom: 12, color: 'var(--border-strong)' }}>
          <Icon name={icon} size={36} sw={1.2} />
        </div>
      )}
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>{title}</div>
      {body && <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{body}</div>}
    </div>
  )
}

// ─── Alert ────────────────────────────────────────────────────────────────────

export function Alert({ tone = 'blue', icon, title, body }) {
  const T = {
    blue:   { bg: 'var(--accent-soft)', border: 'rgba(20,184,166,0.15)', color: 'var(--accent-text)' },
    green:  { bg: 'var(--ok-soft)',     border: 'rgba(16,185,129,0.15)', color: 'var(--ok-text)'     },
    yellow: { bg: 'var(--warn-soft)',   border: 'rgba(245,158,11,0.15)', color: 'var(--warn-text)'   },
    red:    { bg: 'var(--bad-soft)',    border: 'rgba(239,68,68,0.15)',  color: 'var(--bad-text)'    },
  }[tone]

  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      padding: '12px 14px', borderRadius: 'var(--radius-md)',
      background: T.bg, border: `1px solid ${T.border}`,
    }}>
      {icon && <Icon name={icon} size={16} sw={2} style={{ color: T.color, flexShrink: 0, marginTop: 1 }} />}
      <div>
        {title && <div style={{ fontSize: 13, fontWeight: 700, color: T.color, marginBottom: body ? 3 : 0 }}>{title}</div>}
        {body  && <div style={{ fontSize: 12.5, color: T.color, lineHeight: 1.5, opacity: .9 }}>{body}</div>}
      </div>
    </div>
  )
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

export function Spinner({ size = 20, color }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 99,
      border: `2px solid ${color || 'var(--border-strong)'}`,
      borderTopColor: color || 'var(--accent)',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  )
}
