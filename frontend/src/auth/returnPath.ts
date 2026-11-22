export function normalizeReturnPath(path: unknown): string {
  if (
    typeof path === 'string' &&
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !/[\\\t\r\n]/.test(path)
  ) {
    return path
  }

  return '/profile'
}

export function readReturnPath(state: unknown): string {
  return normalizeReturnPath(
    typeof state === 'object' && state !== null && 'from' in state ? state.from : undefined,
  )
}
