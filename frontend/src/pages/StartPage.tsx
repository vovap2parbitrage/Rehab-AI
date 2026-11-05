import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { HomePage } from './HomePage'

export function StartPage() {
  const { authenticated } = useAuth()

  return authenticated ? <Navigate to="/profile" replace /> : <HomePage />
}
