import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — check your .env file.')
}

export const REMEMBER_ME_KEY = 'solarpos_remember'

// "Remember me" toggles which storage the session token lands in — localStorage
// (survives closing the browser) vs sessionStorage (cleared when the tab/browser
// closes). Supabase's storage adapter is fixed at client-creation time, so this
// small adapter re-checks the flag on every read/write instead of picking one
// storage forever. Login.jsx sets the flag right before signing in.
function activeAuthStorage() {
  const remember = typeof window !== 'undefined' ? localStorage.getItem(REMEMBER_ME_KEY) !== '0' : true
  return remember ? window.localStorage : window.sessionStorage
}

const rememberAwareStorage = {
  getItem: (key) => activeAuthStorage().getItem(key),
  setItem: (key, value) => activeAuthStorage().setItem(key, value),
  removeItem: (key) => activeAuthStorage().removeItem(key),
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storage: rememberAwareStorage, persistSession: true, autoRefreshToken: true },
})

// Document numbers (INV-…, DSO-…) are assigned by the database from a sequence
// (next_doc_number in schema.sql) so they can never collide; these ids are only
// for simple rows the client inserts directly.
export function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function computePaymentStatus(totalAmount, amountPaid, dueDate) {
  const total = parseFloat(totalAmount) || 0
  const paid = parseFloat(amountPaid) || 0
  const balance = total - paid
  if (balance <= 0.01) return 'paid'
  const today = new Date().toISOString().slice(0, 10)
  if (dueDate && dueDate < today) return 'overdue'
  if (paid > 0) return 'partial'
  return 'pending'
}

export { computePaymentStatus }
