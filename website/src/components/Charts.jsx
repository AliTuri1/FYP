// Charts.jsx — Recharts wrappers using the Sameer Battery House design tokens
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

export const CHART_COLORS = {
  teal:    '#14B8A6',
  emerald: '#10B981',
  amber:   '#F59E0B',
  crimson: '#EF4444',
  blue:    '#3B82F6',
  violet:  '#8B5CF6',
  rose:    '#F43F5E',
}

export const CAT_COLORS = {
  Solar:       '#14B8A6',
  Panel:       '#14B8A6',
  Inverter:    '#10B981',
  Battery:     '#F59E0B',
  UPS:         '#3B82F6',
  Accessories: '#8B5CF6',
  Other:       '#6B7280',
}

function ChartTooltip({ active, payload, label, prefix = 'Rs ', suffix = '', format }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#0D1828', border: '1px solid rgba(42,58,92,0.8)',
      borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      {label && <div style={{ fontSize: 11, color: '#556680', marginBottom: 6, fontFamily: 'var(--font-ui)' }}>{label}</div>}
      {payload.map((p, i) => {
        const val = typeof p.value === 'number'
          ? format ? format(p.value) : `${prefix}${p.value.toLocaleString()}${suffix}`
          : p.value
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: p.color || '#E8EDF5', fontFamily: 'var(--font-mono)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: p.color, flexShrink: 0 }} />
            {val}
          </div>
        )
      })}
    </div>
  )
}

// 30-day revenue area chart
export function RevenueChart({ data = [] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#14B8A6" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#14B8A6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,58,92,0.45)" />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#556680', fontFamily: 'var(--font-ui)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10, fill: '#556680', fontFamily: 'var(--font-ui)' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey="revenue" stroke="#14B8A6" strokeWidth={2.5} fill="url(#revGrad)"
          dot={false} activeDot={{ r: 5, fill: '#14B8A6', stroke: '#0D1828', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// Daily sales count area chart
export function SalesCountChart({ data = [] }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="cntGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#10B981" stopOpacity={0.22} />
            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,58,92,0.45)" />
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#556680' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9, fill: '#556680' }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip prefix="" suffix=" sales" />} />
        <Area type="monotone" dataKey="count" stroke="#10B981" strokeWidth={2} fill="url(#cntGrad)"
          dot={false} activeDot={{ r: 4, fill: '#10B981', stroke: '#0D1828', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// Top products horizontal bar
export function TopProductsChart({ data = [] }) {
  const colors = Object.values(CHART_COLORS)
  return (
    <ResponsiveContainer width="100%" height={data.length * 40 + 20}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 55, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,58,92,0.4)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: '#556680' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#94A3B8', fontFamily: 'var(--font-ui)' }} axisLine={false} tickLine={false} width={140} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="revenue" radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: 'right', fontSize: 10, fill: '#556680', formatter: v => `${(v / 1000).toFixed(0)}k` }}>
          {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// Category donut
export function CategoryDonut({ data = [] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3} dataKey="value" nameKey="name">
          {data.map((entry, i) => (
            <Cell key={i} fill={CAT_COLORS[entry.name] || '#6B7280'} stroke="none" />
          ))}
        </Pie>
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.[0]) return null
          const p = payload[0]
          return (
            <div style={{ background: '#0D1828', border: '1px solid rgba(42,58,92,0.8)', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: CAT_COLORS[p.name] || '#E8EDF5' }}>{p.name}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#E8EDF5', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                Rs {p.value?.toLocaleString()}
              </div>
            </div>
          )
        }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

// Category legend component
export function CatLegend({ data = [] }) {
  return (
    <div className="flex flex-col gap-1.5 mt-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CAT_COLORS[d.name] || '#6B7280' }} />
            <span className="text-xs text-[var(--text-dim)] truncate">{d.name}</span>
          </div>
          <span className="text-xs font-bold text-[var(--text)] mono flex-shrink-0">
            {((d.value / data.reduce((a, b) => a + b.value, 0)) * 100).toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  )
}
