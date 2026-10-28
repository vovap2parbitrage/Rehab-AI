import { ApiError, apiRequest } from './client'

export type AppRole = 'patient' | 'therapist' | 'admin' | (string & {})

export interface UserProfile {
  id: string
  email: string
  role: AppRole
  pending_role: AppRole | null
  keycloak_sub: string | null
  is_active: boolean
}

export function fetchCurrentUser(options: { signal?: AbortSignal } = {}): Promise<UserProfile> {
  return apiRequest<UserProfile>('/api/v1/auth/me', {
    method: 'GET',
    signal: options.signal,
  })
}

/**
 * The role is only stored as a pending request on the backend.
 * An administrator grants the real role in Keycloak.
 */
export function requestTherapistRole(): Promise<UserProfile> {
  return apiRequest<UserProfile>('/api/v1/auth/role-requests', {
    method: 'POST',
    body: JSON.stringify({ role: 'therapist' }),
  })
}

export function isSessionError(error: unknown): boolean {
  return error instanceof ApiError && (error.kind === 'session' || error.status === 401)
}
