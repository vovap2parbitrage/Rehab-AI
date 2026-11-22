import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { AppRole } from '../api/auth'
import { ErrorPage } from '../pages/ErrorPage'
import { Loading } from '../components/Loading'
import { useAuth } from './useAuth'

interface RoleRouteProps {
  allowedRoles: AppRole[]
  children: ReactNode
}

export function RoleRoute({ allowedRoles, children }: RoleRouteProps) {
  const { initialized, authenticated, role, userError, refreshUser } = useAuth()
  const location = useLocation()

  if (!initialized) return <Loading fullPage label="Перевіряємо сесію…" />
  if (!authenticated) {
    return (
      <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    )
  }
  if (role === null) {
    return userError ? (
      <ErrorPage
        title="Не вдалося перевірити доступ"
        message={userError.message}
        onRetry={refreshUser}
      />
    ) : (
      <Loading fullPage label="Перевіряємо права доступу…" />
    )
  }
  if (!allowedRoles.includes(role)) {
    return <Navigate to="/profile" replace />
  }

  return <>{children}</>
}
