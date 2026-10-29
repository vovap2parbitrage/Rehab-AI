import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type Keycloak from 'keycloak-js'
import { AuthContext, type AuthContextValue, type AuthState } from './AuthContext'
import { describeKeycloakInitError } from './errors'
import {
  getKeycloak,
  initKeycloak,
  loginWithKeycloak,
  logoutFromKeycloak,
  registerWithKeycloak,
} from './keycloak'

const INIT_TIMEOUT_MS = 15_000

const INITIAL_STATE: AuthState = {
  initialized: false,
  authenticated: false,
  tokenParsed: null,
  initError: null,
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('KEYCLOAK_INIT_TIMEOUT'))
    }, timeoutMs)

    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function authStateFrom(keycloak: Keycloak): AuthState {
  return {
    initialized: true,
    authenticated: Boolean(keycloak.authenticated),
    tokenParsed: keycloak.tokenParsed ?? null,
    initError: null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE)

  useEffect(() => {
    let active = true
    const keycloak = getKeycloak()

    const sync = () => {
      if (active) {
        setState(authStateFrom(keycloak))
      }
    }

    const clearSession = () => {
      void keycloak
        .clearToken()
        .catch(() => undefined)
        .then(sync)
    }

    keycloak.onAuthSuccess = sync
    keycloak.onAuthRefreshSuccess = sync
    keycloak.onAuthLogout = sync
    keycloak.onAuthRefreshError = clearSession
    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).then(sync).catch(clearSession)
    }

    withTimeout(initKeycloak(), INIT_TIMEOUT_MS)
      .then(sync)
      .catch((error: unknown) => {
        if (active) {
          setState({
            initialized: true,
            authenticated: false,
            tokenParsed: null,
            initError: describeKeycloakInitError(error),
          })
        }
      })

    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (redirectPath?: string) => {
    await loginWithKeycloak(redirectPath)
  }, [])

  const register = useCallback(async (redirectPath?: string) => {
    await registerWithKeycloak(redirectPath)
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutFromKeycloak()
    } finally {
      try {
        await getKeycloak().clearToken()
      } catch {
        // Nothing else can be done locally if Keycloak does not respond.
      }

      setState({
        initialized: true,
        authenticated: false,
        tokenParsed: null,
        initError: null,
      })
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      register,
      logout,
    }),
    [state, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
