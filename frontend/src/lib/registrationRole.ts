export type RegistrationRole = 'patient' | 'therapist'

const STORAGE_KEY = 'airehab.registration-role'

function isRegistrationRole(value: string | null): value is RegistrationRole {
  return value === 'patient' || value === 'therapist'
}

/**
 * The chosen role only expresses intent. It is kept for the duration of the
 * browser session and sent to the backend as a role request after login.
 */
export function saveRegistrationRole(role: RegistrationRole): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, role)
  } catch {
    // Storage can be unavailable in private mode; registration still works.
  }
}

export function clearRegistrationRole(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}

export function consumeRegistrationRole(): RegistrationRole | null {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY)
    window.sessionStorage.removeItem(STORAGE_KEY)
    return isRegistrationRole(value) ? value : null
  } catch {
    return null
  }
}
