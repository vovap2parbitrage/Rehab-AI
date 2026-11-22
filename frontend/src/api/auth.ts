import { ApiError, apiRequest, type RequestOptions } from './client'

export type AppRole = 'patient' | 'therapist' | 'admin' | (string & {})

export interface UserProfile {
  id: string
  email: string
  role: AppRole
  pending_role: AppRole | null
  keycloak_sub: string | null
  is_active: boolean
}

export function fetchCurrentUser(options: RequestOptions = {}): Promise<UserProfile> {
  return apiRequest<UserProfile>('/api/v1/auth/me', options)
}

/** A new account registered as a therapist gets the role at once, without approval. */
export function chooseTherapistRole(): Promise<UserProfile> {
  return apiRequest<UserProfile>('/api/v1/auth/me/role', {
    method: 'POST',
    body: JSON.stringify({ role: 'therapist' }),
  })
}

export function isSessionError(error: unknown): boolean {
  return error instanceof ApiError && (error.kind === 'session' || error.status === 401)
}
