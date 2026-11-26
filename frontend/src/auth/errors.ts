export type AuthSessionErrorReason = 'expired' | 'unavailable'

export class AuthSessionError extends Error {
  readonly reason: AuthSessionErrorReason

  constructor(reason: AuthSessionErrorReason) {
    super(`Authentication session error: ${reason}`)
    this.name = 'AuthSessionError'
    this.reason = reason
  }
}
