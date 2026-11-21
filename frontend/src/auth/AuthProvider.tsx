import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type Keycloak from 'keycloak-js'
import { fetchCurrentUser, type AppRole } from '../api/auth'
import { ApiError } from '../api/client'
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
const ROLE_RETRY_DELAY_MS = 400

interface RoleResult {
  subject: string | undefined
  attempt: number
  role: AppRole | null
  error: string | null
}

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
  const [roleResult, setRoleResult] = useState<RoleResult | null>(null)
  const [roleAttempt, setRoleAttempt] = useState(0)
  const subject = state.tokenParsed?.sub
  const currentRole = state.authenticated && roleResult?.subject === subject &&
    roleResult?.attempt === roleAttempt ? roleResult : null

  useEffect(() => {
    let active = true
    const keycloak = getKeycloak()

    const sync = () => {
      if (active) {
        const nextState = authStateFrom(keycloak)
        if (!nextState.authenticated) setRoleResult(null)
        setState(nextState)
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

  useEffect(() => {
    if (!state.authenticated) return

    const controller = new AbortController()
    const { signal } = controller
    let retryTimer: number | undefined

    const loadRole = async (canRetry: boolean) => {
      try {
        const user = await fetchCurrentUser({ signal })
        if (!signal.aborted) {
          setRoleResult({ subject, attempt: roleAttempt, role: user.role, error: null })
        }
      } catch (error: unknown) {
        if (signal.aborted) return

        if (canRetry && error instanceof ApiError && (
          error.kind === 'network' || error.kind === 'session' ||
          error.kind === 'unauthorized' || error.status >= 500
        )) {
          retryTimer = window.setTimeout(() => void loadRole(false), ROLE_RETRY_DELAY_MS)
          return
        }

        setRoleResult({
          subject,
          attempt: roleAttempt,
          role: null,
          error: error instanceof ApiError ? error.message : 'Не вдалося перевірити роль користувача.',
        })
      }
    }

    void loadRole(true)
    return () => {
      controller.abort()
      window.clearTimeout(retryTimer)
    }
  }, [state.authenticated, subject, roleAttempt])

  const retryRole = useCallback(() => {
    setRoleAttempt((attempt) => attempt + 1)
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

      setRoleResult(null)
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
      role: currentRole?.role ?? null,
      roleLoading: state.authenticated && currentRole === null,
      roleError: currentRole?.error ?? null,
      retryRole,
      login,
      register,
      logout,
    }),
    [state, currentRole, retryRole, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
