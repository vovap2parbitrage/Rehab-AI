import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  fetchCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  type RegisterInput,
  type UserProfile,
} from '../api/auth'
import { ApiError } from '../api/client'
import { AuthContext, type AuthContextValue } from './AuthContext'
import { describeInitError } from './messages'
import { onSessionEnded, refreshSession } from './session'

const INIT_TIMEOUT_MS = 15_000

interface SessionState {
  initialized: boolean
  user: UserProfile | null
  initError: string | null
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('SESSION_INIT_TIMEOUT'))
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    initialized: false,
    user: null,
    initError: null,
  })
  const [userLoading, setUserLoading] = useState(false)
  const [userError, setUserError] = useState<ApiError | null>(null)

  useEffect(() => {
    let active = true

    const unsubscribe = onSessionEnded(() => {
      if (active) setState((current) => ({ ...current, user: null }))
    })

    withTimeout(refreshSession(), INIT_TIMEOUT_MS)
      .then((session) => {
        if (active) setState({ initialized: true, user: session?.user ?? null, initError: null })
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ initialized: true, user: null, initError: describeInitError(error) })
        }
      })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const updateUser = useCallback((user: UserProfile) => {
    setState((current) => (current.user?.id === user.id ? { ...current, user } : current))
  }, [])

  const refreshUser = useCallback(() => {
    setUserLoading(true)
    setUserError(null)

    fetchCurrentUser()
      .then(updateUser)
      .catch((caught: unknown) => {
        // An ended session is reported through onSessionEnded; the rest stays on screen.
        if (caught instanceof ApiError && caught.kind !== 'session') setUserError(caught)
      })
      .finally(() => setUserLoading(false))
  }, [updateUser])

  const login = useCallback(async (email: string, password: string) => {
    const session = await loginRequest(email, password)
    setState({ initialized: true, user: session.user, initError: null })
  }, [])

  const register = useCallback(async (input: RegisterInput) => {
    const session = await registerRequest(input)
    setState({ initialized: true, user: session.user, initError: null })
  }, [])

  const logout = useCallback(() => logoutRequest(), [])

  const value = useMemo<AuthContextValue>(
    () => ({
      initialized: state.initialized,
      authenticated: state.user !== null,
      initError: state.initError,
      role: state.user?.role ?? null,
      user: state.user,
      userLoading,
      userError,
      refreshUser,
      updateUser,
      login,
      register,
      logout,
    }),
    [state, userLoading, userError, refreshUser, updateUser, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
