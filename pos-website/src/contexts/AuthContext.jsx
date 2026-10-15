import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        enrichUser(session.user)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        enrichUser(session.user)
      } else {
        setUser(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const enrichUser = async (authUser) => {
    const { data: profile } = await supabase
      .from('users')
      .select('id, name, role, org_id, is_active')
      .eq('auth_id', authUser.id)
      .maybeSingle()

    // Role, branch and active flag come only from the `users` profile (created
    // by the database trigger), never from user_metadata, which the user
    // controls. No profile = no access.
    const enriched = {
      ...authUser,
      dbId: profile?.id || authUser.id,
      name: profile?.name || authUser.email?.split('@')[0],
      role: profile?.role || null,
      org_id: profile?.org_id || null,
      is_active: profile?.is_active === true,
    }

    setUser(enriched)
    setLoading(false)
  }

  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { error: { message: error.message } }
      return { data: { session: data.session } }
    } catch (err) {
      return { error: { message: err.message } }
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
