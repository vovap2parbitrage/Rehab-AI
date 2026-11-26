import { clearSession, setSession } from '../auth/session'
import { apiRequest, type RequestOptions } from './client'

export type AppRole = 'patient' | 'therapist'

export interface UserProfile {
  id: string
  email: string
  role: AppRole
  is_active: boolean
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
}

export interface AuthSession {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  user: UserProfile
}

export interface RegisterInput {
  email: string
  password: string
  first_name: string
  last_name: string
  role: 'patient' | 'therapist'
}

// The refresh cookie travels only on the /auth requests that set, use or clear it.
const WITH_COOKIE = { credentials: 'include' } as const

async function startSession(path: string, body: unknown): Promise<AuthSession> {
  const session = await apiRequest<AuthSession>(
    path,
    { method: 'POST', body: JSON.stringify(body) },
    { authenticated: false, ...WITH_COOKIE },
  )
  setSession(session)
  return session
}

export function fetchCurrentUser(options: RequestOptions = {}): Promise<UserProfile> {
  return apiRequest<UserProfile>('/api/v1/auth/me', options)
}

export function login(email: string, password: string): Promise<AuthSession> {
  return startSession('/api/v1/auth/login', { email, password })
}

export function register(input: RegisterInput): Promise<AuthSession> {
  return startSession('/api/v1/auth/register', input)
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<void>(
      '/api/v1/auth/logout',
      { method: 'POST' },
      { authenticated: false, ...WITH_COOKIE },
    )
  } finally {
    clearSession()
  }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AuthSession> {
  const session = await apiRequest<AuthSession>(
    '/api/v1/auth/change-password',
    {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    },
    WITH_COOKIE,
  )
  setSession(session)
  return session
}
