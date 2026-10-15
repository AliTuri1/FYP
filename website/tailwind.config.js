/** @type {import('tailwindcss').Config} */

/**
 * Sameer Battery House POS — Design Token System
 * Visual Identity: Solar / Industrial Grid Terminal
 *
 * Dark canvas:  Deep navy (#0B132B → #1C2541)
 * Light canvas: Clinical high-contrast white for bright shop lighting
 * Accent:       Solar Teal — positive data flows, verified states, active stock
 * Warning:      Amber — provisional/unverified, pending audit
 * Danger:       Crimson — integrity mismatch, credit breach, lock state
 * Mono font:    JetBrains Mono — all serial numbers, currency, numeric IDs
 */

export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],

  darkMode: ['class', '[data-theme="dark"]'],

  theme: {
    extend: {

      // ─── Color Palette ───────────────────────────────────────────────────────

      colors: {

        // Canvas — dark navy layers (deepest → most elevated)
        canvas: {
          950: '#050A18',
          900: '#070E1C',
          800: '#0B132B',   // deepest background
          700: '#111B38',
          600: '#162032',   // card / panel surface
          500: '#1C2541',   // sidebar / raised panel
          400: '#1E2D45',   // hover states
          300: '#243354',   // subtle highlights
          200: '#2A3A5C',   // borders
          100: '#344970',   // strong borders / dividers
          50:  '#4A6080',   // disabled / muted borders
        },

        // Solar Teal — cleared, verified, active, positive cash flow
        teal: {
          50:   '#EDFCFA',
          100:  '#CCFAF5',
          200:  '#99F3EC',
          300:  '#5EEAD4',
          400:  '#2DD4BF',
          500:  '#14B8A6',  // primary accent
          600:  '#0D9488',  // hover
          700:  '#0F766E',  // pressed
          800:  '#115E59',
          900:  '#134E4A',
          glow: 'rgba(20,184,166,0.22)',
          soft: 'rgba(20,184,166,0.10)',
          ring: 'rgba(20,184,166,0.35)',
        },

        // Emerald — double-verified, immutable committed records
        emerald: {
          300:  '#6EE7B7',
          400:  '#34D399',
          500:  '#10B981',
          600:  '#059669',
          700:  '#047857',
          glow: 'rgba(16,185,129,0.20)',
          soft: 'rgba(16,185,129,0.10)',
          ring: 'rgba(16,185,129,0.35)',
        },

        // Amber — pending, unverified bank transfers, awaiting audit
        amber: {
          300:  '#FCD34D',
          400:  '#FBBF24',
          500:  '#F59E0B',  // primary warning
          600:  '#D97706',
          700:  '#B45309',
          glow: 'rgba(245,158,11,0.22)',
          soft: 'rgba(245,158,11,0.10)',
          ring: 'rgba(245,158,11,0.35)',
        },

        // Crimson — mismatch, over credit limit, data integrity failure
        crimson: {
          300:  '#FCA5A5',
          400:  '#F87171',
          500:  '#EF4444',  // primary danger
          600:  '#DC2626',
          700:  '#B91C1C',
          glow: 'rgba(239,68,68,0.22)',
          soft: 'rgba(239,68,68,0.10)',
          ring: 'rgba(239,68,68,0.35)',
        },

        // Ink — dark-theme text hierarchy
        ink: {
          primary:   '#E8EDF5',   // headings, values
          secondary: '#94A3B8',   // labels, subtitles
          muted:     '#556680',   // placeholder, hints
          faint:     '#33445C',   // disabled
          mono:      '#A8D5C5',   // serial numbers, currency (teal-tinted for legibility)
          inverse:   '#0B132B',   // text on light surfaces
        },

        // Paper — light-theme surfaces
        paper: {
          base:    '#EFF3FA',   // page background
          surface: '#FFFFFF',   // cards
          raised:  '#F6F8FD',   // secondary cards
          muted:   '#E8EDF6',   // well / sunken
          border:  '#CDD5E5',   // default border
          strong:  '#B0BCCE',   // strong border / divider
          text:    '#0D1828',   // primary text
          dim:     '#3D4E66',   // secondary text
          faint:   '#7A8FA8',   // muted text
        },
      },

      // ─── Typography ──────────────────────────────────────────────────────────

      fontFamily: {
        ui:   [
          'Inter', 'system-ui', '-apple-system',
          'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"', '"Fira Code"', '"Cascadia Code"',
          '"Source Code Pro"', 'Consolas', '"Courier New"', 'monospace',
        ],
      },

      fontSize: {
        // UI scale
        'label':  ['10.5px', { lineHeight: '14px', letterSpacing: '0.07em', fontWeight: '700' }],
        'xs':     ['11px',   { lineHeight: '16px',  letterSpacing: '0.01em' }],
        'sm':     ['12.5px', { lineHeight: '18px' }],
        'base':   ['13.5px', { lineHeight: '20px' }],
        'md':     ['14px',   { lineHeight: '21px' }],
        'lg':     ['15.5px', { lineHeight: '22px' }],
        'xl':     ['17px',   { lineHeight: '25px' }],
        '2xl':    ['20px',   { lineHeight: '28px' }],
        '3xl':    ['26px',   { lineHeight: '34px' }],
        '4xl':    ['32px',   { lineHeight: '40px', letterSpacing: '-0.02em' }],
        // Specialized
        'serial': ['13px',   { lineHeight: '20px', letterSpacing: '0.10em', fontFamily: '"JetBrains Mono", monospace' }],
        'amount': ['13.5px', { lineHeight: '20px', fontVariantNumeric: 'tabular-nums', fontFamily: '"JetBrains Mono", monospace' }],
        'kpi':    ['30px',   { lineHeight: '36px', letterSpacing: '-0.03em', fontWeight: '800' }],
        'kpi-sm': ['22px',   { lineHeight: '28px', letterSpacing: '-0.02em', fontWeight: '800' }],
      },

      fontWeight: {
        normal:    '400',
        medium:    '500',
        semibold:  '600',
        bold:      '700',
        extrabold: '800',
        black:     '900',
      },

      letterSpacing: {
        'tighter': '-0.03em',
        'tight':   '-0.02em',
        'snug':    '-0.01em',
        'normal':  '0',
        'wide':    '0.02em',
        'wider':   '0.05em',
        'widest':  '0.08em',
        'serial':  '0.10em',
        'label':   '0.07em',
        'mono':    '0.04em',
      },

      // ─── Spacing ─────────────────────────────────────────────────────────────

      spacing: {
        // Row heights (input / table row consistency)
        'row':    '46px',
        'row-sm': '36px',
        'row-lg': '52px',
        // Named layout tokens
        'sidebar': '240px',
        'header':  '58px',
        'pad':     '24px',
        'pad-sm':  '16px',
        'gap':     '16px',
        'gap-sm':  '10px',
      },

      // ─── Border Radius ────────────────────────────────────────────────────────

      borderRadius: {
        'none':  '0',
        'sm':    '4px',
        'md':    '8px',
        'lg':    '10px',
        'xl':    '14px',
        '2xl':   '18px',
        'full':  '9999px',
        // Semantic
        'input': '10px',
        'card':  '14px',
        'badge': '6px',
        'panel': '16px',
        'pill':  '9999px',
      },

      // ─── Shadows ─────────────────────────────────────────────────────────────

      boxShadow: {
        // Elevation (dark-optimized — strong because dark surfaces need definition)
        'xs':      '0 1px 2px rgba(0,0,0,0.5)',
        'sm':      '0 1px 4px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.35)',
        'md':      '0 4px 12px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.30)',
        'lg':      '0 8px 28px rgba(0,0,0,0.55), 0 4px 8px rgba(0,0,0,0.35)',
        'xl':      '0 20px 60px rgba(0,0,0,0.65), 0 8px 16px rgba(0,0,0,0.40)',
        // Panel with 1px border-glow effect
        'panel':   '0 0 0 1px rgba(42,58,92,0.7), 0 4px 20px rgba(0,0,0,0.50)',
        'card':    '0 0 0 1px rgba(42,58,92,0.55), 0 2px 8px rgba(0,0,0,0.40)',
        'modal':   '0 24px 80px rgba(0,0,0,0.70), 0 0 0 1px rgba(42,58,92,0.5)',
        'inner':   'inset 0 1px 0 rgba(255,255,255,0.05)',
        // Semantic focus rings
        'ring-teal':    '0 0 0 3px rgba(20,184,166,0.38)',
        'ring-amber':   '0 0 0 3px rgba(245,158,11,0.38)',
        'ring-crimson': '0 0 0 3px rgba(239,68,68,0.38)',
        'ring-emerald': '0 0 0 3px rgba(16,185,129,0.38)',
        // Glow effects for verified / alert states
        'glow-teal':    '0 0 28px rgba(20,184,166,0.35), 0 0 80px rgba(20,184,166,0.10)',
        'glow-amber':   '0 0 28px rgba(245,158,11,0.35), 0 0 80px rgba(245,158,11,0.10)',
        'glow-crimson': '0 0 28px rgba(239,68,68,0.35),  0 0 80px rgba(239,68,68,0.10)',
        'glow-emerald': '0 0 28px rgba(16,185,129,0.35), 0 0 80px rgba(16,185,129,0.10)',
      },

      // ─── Animations ──────────────────────────────────────────────────────────

      animation: {
        // Status indicator pulsing (pending payment ring)
        'pulse-status':   'pulse-status 2.2s cubic-bezier(0.4,0,0.6,1) infinite',
        // Verification state transitions
        'verify-match':   'verify-match 0.28s cubic-bezier(0.2,0.8,0.3,1) both',
        'verify-fail':    'verify-fail 0.4s ease both',
        // Action lock/unlock (button becomes available)
        'unlock':         'unlock 0.4s cubic-bezier(0.2,0.8,0.3,1) both',
        // Standard motion
        'slide-up':       'slide-up 0.2s cubic-bezier(0.2,0.8,0.3,1) both',
        'slide-down':     'slide-down 0.2s cubic-bezier(0.2,0.8,0.3,1) both',
        'fade-in':        'fade-in 0.15s ease both',
        'scale-in':       'scale-in 0.18s cubic-bezier(0.2,0.8,0.3,1) both',
        // Financial data updates
        'balance-update': 'balance-update 0.5s cubic-bezier(0.2,0.8,0.3,1) both',
        // Credit limit warning pulse
        'credit-warn':    'credit-warn 1.8s ease-in-out infinite',
        // Serial number scanning sweep
        'serial-scan':    'serial-scan 0.35s ease both',
      },

      keyframes: {
        'pulse-status': {
          '0%, 100%': { opacity: '1',   boxShadow: '0 0 0 0 var(--tw-shadow-color, currentColor)' },
          '50%':       { opacity: '0.75', boxShadow: '0 0 0 8px transparent' },
        },
        'verify-match': {
          'from': { transform: 'scale(0.97)', opacity: '0.3' },
          'to':   { transform: 'scale(1)',    opacity: '1'   },
        },
        'verify-fail': {
          '0%,100%': { transform: 'translateX(0)' },
          '15%': { transform: 'translateX(-6px)' },
          '30%': { transform: 'translateX(6px)' },
          '45%': { transform: 'translateX(-4px)' },
          '60%': { transform: 'translateX(4px)' },
          '75%': { transform: 'translateX(-2px)' },
          '90%': { transform: 'translateX(2px)' },
        },
        'unlock': {
          'from': { filter: 'blur(1px)', opacity: '0.35', transform: 'scale(0.97) translateY(3px)' },
          'to':   { filter: 'blur(0)',   opacity: '1',    transform: 'scale(1) translateY(0)' },
        },
        'slide-up': {
          'from': { opacity: '0', transform: 'translateY(8px)' },
          'to':   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          'from': { opacity: '0', transform: 'translateY(-8px)' },
          'to':   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          'from': { opacity: '0' },
          'to':   { opacity: '1' },
        },
        'scale-in': {
          'from': { opacity: '0', transform: 'scale(0.94)' },
          'to':   { opacity: '1', transform: 'scale(1)' },
        },
        'balance-update': {
          '0%':   { transform: 'scale(1)' },
          '35%':  { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' },
        },
        'credit-warn': {
          '0%,100%': { borderColor: 'rgba(245,158,11,0.8)', boxShadow: '0 0 0 0 rgba(245,158,11,0.5)' },
          '50%':     { borderColor: 'rgba(239,68,68,0.9)',  boxShadow: '0 0 0 6px rgba(239,68,68,0)'   },
        },
        'serial-scan': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },

      // ─── Transitions ─────────────────────────────────────────────────────────

      transitionDuration: {
        'fast':   '80ms',
        'base':   '130ms',
        'slow':   '220ms',
        'slower': '380ms',
      },
      transitionTimingFunction: {
        'spring':  'cubic-bezier(0.2, 0.8, 0.3, 1)',
        'snap-in': 'cubic-bezier(0.0, 0.0, 0.2, 1)',
        'ease-out-back': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },

      // ─── Z-Index Scale ────────────────────────────────────────────────────────

      zIndex: {
        'behind':   '-1',
        'base':      '0',
        'raised':   '10',
        'sticky':   '20',
        'header':   '30',
        'overlay':  '40',
        'modal':    '50',
        'toast':    '60',
        'tooltip':  '70',
        'critical': '9999',
      },
    },
  },

  plugins: [],
}
