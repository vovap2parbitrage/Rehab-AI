import type { AuthSession } from '../api/auth'
import { appConfig } from '../config/appConfig'
import { AuthSessionError } from './errors'

const EXPIRY_MARGIN_MS = 30_000

// The access token lives only in memory. The refresh token is an HttpOnly cookie
// that scripts cannot read, so a page reload restores the session through it.
let accessToken: string | null = null
let expiresAt = 0
let pendingRefresh: Promise<AuthSession | null> | null = null
const endListeners = new Set<() => void>()

export function setSession({
  access_token,
  expires_in,
}: Pick<AuthSession, 'access_token' | 'expires_in'>): void {
  accessToken = access_token
  expiresAt = Date.now() + expires_in * 1000
}

/** Forgets the session and tells the interface that the user is signed out. */
export function clearSession(): void {
  accessToken = null
  expiresAt = 0
  endListeners.forEach((listener) => listener())
}

export function onSessionEnded(listener: () => void): () => void {
  endListeners.add(listener)
  return () => endListeners.delete(listener)
}

async function requestRefresh(): Promise<AuthSession | null> {
  let response: Response

  try {
    response = await fetch(`${appConfig.apiBaseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    })
  } catch {
    throw new AuthSessionError('unavailable')
  }

  if (response.status === 401 || response.status === 403) {
    accessToken = null
    expiresAt = 0
    return null
  }

  if (!response.ok) {
    throw new AuthSessionError('unavailable')
  }

  const session = (await response.json()) as AuthSession
  setSession(session)
  return session
}

/**
 * Exchanges the refresh cookie for a new access token. Resolves to null when there is no
 * valid session. Parallel callers share one request: the cookie is rotated on every use.
 */
export function refreshSession(): Promise<AuthSession | null> {
  pendingRefresh ??= requestRefresh().finally(() => {
    pendingRefresh = null
  })
  return pendingRefresh
}

export async function getValidAccessToken(): Promise<string> {
  if (accessToken && Date.now() < expiresAt - EXPIRY_MARGIN_MS) {
    return accessToken
  }

  const session = await refreshSession()
  if (!session) {
    clearSession()
    throw new AuthSessionError('expired')
  }

  return session.access_token
}
