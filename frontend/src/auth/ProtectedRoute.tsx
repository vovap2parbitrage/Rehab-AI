import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'
import { Loading } from '../components/Loading'
import { ErrorPage } from '../pages/ErrorPage'

interface ProtectedRouteProps {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { initialized, authenticated, initError } = useAuth()
  const location = useLocation()

  if (!initialized) {
    return <Loading fullPage label="Перевіряємо сесію Keycloak…" />
  }

  if (initError) {
    return <ErrorPage title="Сервіс авторизації недоступний" message={initError} />
  }

  const searchParams = new URLSearchParams(location.search)
  const oauthError = searchParams.get('error')

  if (oauthError) {
    return <Navigate to={`/error?error=${encodeURIComponent(oauthError)}`} replace />
  }

  if (!authenticated) {
    const from = `${location.pathname}${location.search}`
    return <Navigate to="/login" replace state={{ from }} />
  }

  return <>{children}</>
}
