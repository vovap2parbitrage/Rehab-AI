import { ApiError } from '../api/client'

/** Turns anything thrown by an API call into text that can be shown to the user. */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.detail || error.message
  if (error instanceof Error) return error.message
  return fallback
}
