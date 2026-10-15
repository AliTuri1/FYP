import { createContext, useContext, useState, useCallback } from 'react'

const OrganizationContext = createContext()

export function OrganizationProvider({ children }) {
  const [currentOrg, setCurrentOrg] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [availableOrgs, setAvailableOrgs] = useState([])

  const selectOrg = useCallback((org, role) => {
    setCurrentOrg(org)
    setUserRole(role)
    localStorage.setItem('currentOrgId', org.id)
    localStorage.setItem('userRole', role)
  }, [])

  const clearOrg = useCallback(() => {
    setCurrentOrg(null)
    setUserRole(null)
    localStorage.removeItem('currentOrgId')
    localStorage.removeItem('userRole')
  }, [])

  const isSuperAdmin = userRole === 'super_admin'
  const isOrgAdmin = userRole === 'org_admin'
  const isSalesUser = userRole === 'sales_user'

  const value = {
    currentOrg,
    userRole,
    availableOrgs,
    selectOrg,
    clearOrg,
    setAvailableOrgs,
    isSuperAdmin,
    isOrgAdmin,
    isSalesUser,
  }

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  )
}

export function useOrganization() {
  const context = useContext(OrganizationContext)
  if (!context) {
    throw new Error('useOrganization must be used within OrganizationProvider')
  }
  return context
}
