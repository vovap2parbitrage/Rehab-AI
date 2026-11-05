import Keycloak, { type KeycloakLoginOptions } from 'keycloak-js'
import { appConfig } from '../config/appConfig'
import { clearRegistrationRole } from '../lib/registrationRole'
import { AuthSessionError } from './errors'

let keycloakInstance: Keycloak | null = null
let initialization: Promise<boolean> | null = null

export function getKeycloak(): Keycloak {
  if (!keycloakInstance) {
    keycloakInstance = new Keycloak({
      url: appConfig.keycloakUrl,
      realm: appConfig.keycloakRealm,
      clientId: appConfig.keycloakClientId,
    })
  }

  return keycloakInstance
}

function toAppUrl(path = '/profile'): string {
  const safePath = path.startsWith('/') && !path.startsWith('//') ? path : '/profile'
  return `${window.location.origin}${safePath}`
}

/**
 * Initializes the Keycloak adapter once per page load.
 *
 * `check-sso` restores an existing Keycloak session after a page refresh without
 * redirecting anonymous visitors. The silent iframe check is used instead of the
 * default login-state iframe; tokens stay in keycloak-js memory.
 */
export function initKeycloak(): Promise<boolean> {
  if (initialization) {
    return initialization
  }

  const keycloak = getKeycloak()

  initialization = keycloak
    .init({
      onLoad: 'check-sso',
      flow: 'standard',
      responseMode: 'query',
      pkceMethod: 'S256',
      useNonce: true,
      checkLoginIframe: false,
      silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
      messageReceiveTimeout: 10_000,
    })
    .catch((error: unknown) => {
      // A Keycloak instance can only be initialized once. Forget it so a retry
      // (for example after Keycloak comes back online) starts from a clean slate.
      initialization = null
      keycloakInstance = null
      throw error
    })

  return initialization
}

export async function loginWithKeycloak(redirectPath?: string): Promise<void> {
  // A role chosen on the registration page must not leak into a normal login.
  clearRegistrationRole()
  await initKeycloak()
  await getKeycloak().login({ redirectUri: toAppUrl(redirectPath) })
}

export async function registerWithKeycloak(redirectPath?: string): Promise<void> {
  await initKeycloak()

  // Keycloak 26 opens the registration form with `prompt=create`.
  // The keycloak-js typings do not list this newer value yet, so keep the cast local.
  const options = {
    redirectUri: toAppUrl(redirectPath),
    prompt: 'create',
  } as unknown as KeycloakLoginOptions

  await getKeycloak().login(options)
}

export async function logoutFromKeycloak(): Promise<void> {
  await initKeycloak()
  await getKeycloak().logout({ redirectUri: toAppUrl('/') })
}

/**
 * Returns a valid access token for the FastAPI backend.
 *
 * keycloak-js refreshes the token when it expires within the next 30 seconds.
 * The token is never persisted to localStorage by this application.
 */
export async function getValidAccessToken(minValiditySeconds = 30): Promise<string> {
  const keycloak = getKeycloak()

  if (!keycloak.authenticated) {
    throw new AuthSessionError('not-authenticated')
  }

  try {
    await keycloak.updateToken(minValiditySeconds)
  } catch {
    try {
      await keycloak.clearToken()
    } catch {
      // The original refresh failure is the useful error.
    }
    throw new AuthSessionError('expired')
  }

  if (!keycloak.token) {
    throw new AuthSessionError('missing-token')
  }

  return keycloak.token
}
