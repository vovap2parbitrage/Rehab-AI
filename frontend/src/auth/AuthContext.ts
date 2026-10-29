import { createContext } from 'react'
import type { KeycloakTokenParsed } from 'keycloak-js'

export interface AuthState {
  initialized: boolean
  authenticated: boolean
  tokenParsed: KeycloakTokenParsed | null
  initError: string | null
}

export interface AuthContextValue extends AuthState {
  login: (redirectPath?: string) => Promise<void>
  register: (redirectPath?: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
