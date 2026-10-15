import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { useOrganization } from './contexts/OrganizationContext'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import PosDashboard from './pages/PosDashboard'
import ProtectedRoute from './components/ProtectedRoute'

// The POS website: main-branch cashiers and distributor branch staff only.
// The main admin uses the admin website in ../website.
const POS_ROLES = ['sales_user', 'distributor_user']

function BlockedScreen({ title, message }) {
  const { signOut } = useAuth()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)', gap: 16, textAlign: 'center', padding: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-faint)', maxWidth: 360 }}>{message}</div>
      <button onClick={signOut} style={{ padding: '9px 20px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Sign Out</button>
    </div>
  )
}

function AppRoutes() {
  const { user, loading } = useAuth()
  const { currentOrg, selectOrg, clearOrg } = useOrganization()

  useEffect(() => {
    if (!user) { clearOrg(); return }
    if (user.org_id && !currentOrg) {
      supabase.from('organizations').select('id, name, type').eq('id', user.org_id).single()
        .then(({ data: org }) => { if (org) selectOrg({ id: org.id, name: org.name, type: org.type }, user.role) })
        .catch(() => {})
    }
  }, [user, currentOrg, selectOrg, clearOrg])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)', gap: 16 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#14B8A6,#0D9488)', display: 'grid', placeItems: 'center', boxShadow: '0 4px 14px rgba(20,184,166,0.4)' }}>
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 L4 13 H11 L9 21 L18 9 H11 Z" /></svg>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Sameer Battery House POS</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Loading…</div>
        </div>
      </div>
    )
  }

  if (user && !user.is_active) {
    return <BlockedScreen title="Account not active" message="This account has been deactivated or was never set up by an admin. Ask the main admin to check it in All Users." />
  }

  if (user && POS_ROLES.includes(user.role)) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><PosDashboard /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  if (user) {
    return <BlockedScreen title="This account isn't a POS account" message="The main admin signs in on the admin website, not here. If this is a branch account, ask the main admin to check it in All Users." />
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default AppRoutes
