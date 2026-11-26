import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { AppRole } from '../api/auth'
import { Loading } from '../components/Loading'
import { useAuth } from './useAuth'

interface RoleRouteProps {
  allowedRoles: AppRole[]
  children: ReactNode
}

export function RoleRoute({ allowedRoles, children }: RoleRouteProps) {
  const { initialized, authenticated, role } = useAuth()
  const location = useLocation()

  if (!initialized) return <Loading fullPage label="Перевіряємо сесію…" />
  if (!authenticated || role === null) {
    return (
      <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    )
  }
  if (!allowedRoles.includes(role)) {
    return <Navigate to="/profile" replace />
  }

  return <>{children}</>
}
