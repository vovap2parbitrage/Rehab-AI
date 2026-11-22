import { createContext } from 'react'
import type { KeycloakTokenParsed } from 'keycloak-js'
import type { AppRole, UserProfile } from '../api/auth'
import type { ApiError } from '../api/client'

export interface AuthState {
  initialized: boolean
  authenticated: boolean
  tokenParsed: KeycloakTokenParsed | null
  initError: string | null
}

export interface AuthContextValue extends AuthState {
  role: AppRole | null
  user: UserProfile | null
  userLoading: boolean
  userError: ApiError | null
  refreshUser: () => void
  updateUser: (user: UserProfile) => void
  login: (redirectPath?: string) => Promise<void>
  register: (redirectPath?: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
