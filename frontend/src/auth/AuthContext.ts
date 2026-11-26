import { createContext } from 'react'
import type { AppRole, RegisterInput, UserProfile } from '../api/auth'
import type { ApiError } from '../api/client'

export interface AuthContextValue {
  initialized: boolean
  authenticated: boolean
  initError: string | null
  role: AppRole | null
  user: UserProfile | null
  userLoading: boolean
  userError: ApiError | null
  refreshUser: () => void
  updateUser: (user: UserProfile) => void
  login: (email: string, password: string) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
