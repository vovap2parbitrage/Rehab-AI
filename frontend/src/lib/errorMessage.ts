/** Turns anything thrown by an API call into text that can be shown to the user. */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  return fallback
}
