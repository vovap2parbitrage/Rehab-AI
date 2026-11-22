import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type Keycloak from 'keycloak-js'
import { fetchCurrentUser, isSessionError, type UserProfile } from '../api/auth'
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
const USER_RETRY_DELAY_MS = 400

interface UserResult {
  session: string
  user: UserProfile | null
  error: ApiError | null
}

interface UserRequest {
  attempt: number
  result?: UserResult
  settled: boolean
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
  const [userRequest, setUserRequest] = useState<UserRequest>({ attempt: 0, settled: false })
  const { attempt, result } = userRequest
  const session = state.authenticated
    ? JSON.stringify([state.tokenParsed?.sub, state.tokenParsed?.session_state])
    : null
  const currentUser = session !== null && result?.session === session ? result : undefined
  const userLoading = session !== null && (!userRequest.settled || currentUser === undefined)
  const userError = userLoading ? null : (currentUser?.error ?? null)

  useEffect(() => {
    let active = true
    const keycloak = getKeycloak()

    const sync = () => {
      if (active) {
        const nextState = authStateFrom(keycloak)
        if (!nextState.authenticated) {
          setUserRequest((current) => ({ attempt: current.attempt + 1, settled: false }))
        }
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
    if (session === null || !userLoading) return

    const controller = new AbortController()
    const { signal } = controller
    let retryTimer: number | undefined

    const loadUser = async (canRetry: boolean) => {
      try {
        const user = await fetchCurrentUser({ signal })
        if (!signal.aborted) {
          setUserRequest((current) =>
            current.attempt === attempt
              ? { attempt, settled: true, result: { session, user, error: null } }
              : current,
          )
        }
      } catch (caught: unknown) {
        if (signal.aborted) return

        const error =
          caught instanceof ApiError
            ? caught
            : new ApiError('Не вдалося завантажити дані облікового запису.', 'unknown')

        if (
          canRetry &&
          (error.kind === 'network' ||
            error.kind === 'session' ||
            error.kind === 'unauthorized' ||
            error.kind === 'unavailable' ||
            error.kind === 'server' ||
            error.status >= 500)
        ) {
          retryTimer = window.setTimeout(() => void loadUser(false), USER_RETRY_DELAY_MS)
          return
        }

        setUserRequest((current) => {
          if (current.attempt !== attempt) return current
          const retainUser =
            current.result?.session === session &&
            !isSessionError(error) &&
            error.kind !== 'forbidden'
          return {
            attempt,
            settled: true,
            result: { session, user: retainUser ? (current.result?.user ?? null) : null, error },
          }
        })
      }
    }

    void loadUser(true)
    return () => {
      controller.abort()
      window.clearTimeout(retryTimer)
    }
  }, [session, userLoading, attempt])

  const refreshUser = useCallback(() => {
    setUserRequest((current) => ({ ...current, attempt: current.attempt + 1, settled: false }))
  }, [])

  const updateUser = useCallback(
    (user: UserProfile) => {
      setUserRequest((current) => {
        if (
          session === null ||
          current.result?.session !== session ||
          current.result.user?.id !== user.id
        ) {
          return current
        }

        return {
          attempt: current.attempt + 1,
          settled: true,
          result: { session, user, error: null },
        }
      })
    },
    [session],
  )

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

      setUserRequest((current) => ({ attempt: current.attempt + 1, settled: false }))
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
      role: currentUser?.user?.role ?? null,
      user: currentUser?.user ?? null,
      userLoading,
      userError,
      refreshUser,
      updateUser,
      login,
      register,
      logout,
    }),
    [state, currentUser, userLoading, userError, refreshUser, updateUser, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
