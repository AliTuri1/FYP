import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { OrganizationProvider } from './contexts/OrganizationContext'
import { setupApi } from './lib/supabaseApi'
import { supabase } from './lib/supabase'
import './index.css'

supabase.auth.onAuthStateChange(() => {})
setupApi()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <OrganizationProvider>
          <App />
          <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
        </OrganizationProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
