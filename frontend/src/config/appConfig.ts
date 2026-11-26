function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function readEnv(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

/**
 * Values default to the local Docker Compose addresses documented in frontend/README.md.
 * Every value can be overridden at build time through Vite environment variables.
 */
export const appConfig = Object.freeze({
  apiBaseUrl: trimTrailingSlash(
    readEnv(import.meta.env.VITE_API_BASE_URL, 'http://localhost:8001'),
  ),
})
