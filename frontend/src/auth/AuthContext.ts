import { createContext } from 'react'
import type { KeycloakTokenParsed } from 'keycloak-js'
import type { AppRole } from '../api/auth'

export interface AuthState {
  initialized: boolean
  authenticated: boolean
  tokenParsed: KeycloakTokenParsed | null
  initError: string | null
}

export interface AuthContextValue extends AuthState {
  role: AppRole | null
  roleLoading: boolean
  roleError: string | null
  retryRole: () => void
  login: (redirectPath?: string) => Promise<void>
  register: (redirectPath?: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
