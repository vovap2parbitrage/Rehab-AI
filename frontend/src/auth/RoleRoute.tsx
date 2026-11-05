import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { fetchCurrentUser, type AppRole } from '../api/auth'
import { ApiError } from '../api/client'
import { ErrorPage } from '../pages/ErrorPage'
import { Loading } from '../components/Loading'
import { useAuth } from './useAuth'

interface RoleRouteProps {
  allowedRoles: AppRole[]
  children: ReactNode
}

export function RoleRoute({ allowedRoles, children }: RoleRouteProps) {
  const { initialized, authenticated } = useAuth()
  const location = useLocation()
  const [role, setRole] = useState<AppRole | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!initialized || !authenticated) return

    const controller = new AbortController()
    fetchCurrentUser({ signal: controller.signal })
      .then((user) => {
        if (!controller.signal.aborted) setRole(user.role)
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return
        setError(
          caught instanceof ApiError
            ? caught.message
            : 'Не вдалося перевірити роль користувача.',
        )
      })

    return () => controller.abort()
  }, [authenticated, initialized])

  if (!initialized) return <Loading fullPage label="Перевіряємо сесію Keycloak…" />
  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  }
  if (error) return <ErrorPage title="Не вдалося перевірити доступ" message={error} />
  if (role === null) return <Loading fullPage label="Перевіряємо права доступу…" />
  if (!allowedRoles.includes(role)) {
    return <Navigate to="/profile" replace />
  }

  return <>{children}</>
}
