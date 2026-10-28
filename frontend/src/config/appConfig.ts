function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function readEnv(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

/**
 * Values default to the local development setup documented in README_KEYCLOAK.md.
 * Every value can be overridden at build time through Vite environment variables.
 */
export const appConfig = Object.freeze({
  keycloakUrl: trimTrailingSlash(
    readEnv(import.meta.env.VITE_KEYCLOAK_URL, 'http://localhost:8080'),
  ),
  keycloakRealm: readEnv(import.meta.env.VITE_KEYCLOAK_REALM, 'rehab-ai'),
  keycloakClientId: readEnv(import.meta.env.VITE_KEYCLOAK_CLIENT_ID, 'rehab-ai-web'),
  apiBaseUrl: trimTrailingSlash(
    readEnv(import.meta.env.VITE_API_BASE_URL, 'http://localhost:8000'),
  ),
})

export const appName = 'AIRehab'
