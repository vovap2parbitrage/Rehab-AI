import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { login, logout } from '../api/auth'
import { ApiError, apiRequest } from '../api/client'
import { clearSession, getValidAccessToken, onSessionEnded, setSession } from '../auth/session'
import { AuthSessionError } from '../auth/errors'

const user = {
  id: 'u1',
  email: 'olena@example.com',
  role: 'patient',
  is_active: true,
  first_name: 'Олена',
  last_name: 'Коваль',
  date_of_birth: null,
}

function sessionBody(token: string, expiresIn = 900) {
  return { access_token: token, token_type: 'bearer', expires_in: expiresIn, user }
}

function reply(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function calls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([url, init]) => ({
    path: String(url).replace('http://localhost:8001', ''),
    init: init as RequestInit,
  }))
}

describe('session', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    clearSession()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('uses the access token in memory without asking the server', async () => {
    setSession({ access_token: 'in-memory', expires_in: 900 })

    await expect(getValidAccessToken()).resolves.toBe('in-memory')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never writes the token to browser storage', async () => {
    fetchMock.mockImplementation(() => reply(sessionBody('secret-token')))

    await login('olena@example.com', 'correct-horse-battery')

    expect(JSON.stringify({ ...window.localStorage })).not.toContain('secret-token')
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain('secret-token')
  })

  it('renews an expiring token through the refresh cookie, once for parallel callers', async () => {
    setSession({ access_token: 'old', expires_in: 10 })
    fetchMock.mockImplementation(() => reply(sessionBody('renewed')))

    const tokens = await Promise.all([getValidAccessToken(), getValidAccessToken()])

    expect(tokens).toEqual(['renewed', 'renewed'])
    expect(calls(fetchMock)).toHaveLength(1)
    expect(calls(fetchMock)[0]).toMatchObject({
      path: '/api/v1/auth/refresh',
      init: { method: 'POST', credentials: 'include' },
    })
  })

  it('reports an ended session when the refresh cookie is no longer valid', async () => {
    const ended = vi.fn()
    const unsubscribe = onSessionEnded(ended)
    fetchMock.mockImplementation(() => reply({ detail: 'Invalid or expired session' }, 401))

    await expect(getValidAccessToken()).rejects.toMatchObject({ reason: 'expired' })

    expect(ended).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('does not call a down server an ended session', async () => {
    const ended = vi.fn()
    const unsubscribe = onSessionEnded(ended)
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(getValidAccessToken()).rejects.toBeInstanceOf(AuthSessionError)

    expect(ended).not.toHaveBeenCalled()
    unsubscribe()
  })
})

describe('apiRequest with a session', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    clearSession()
    setSession({ access_token: 'token-1', expires_in: 900 })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the bearer token and no cookies', async () => {
    fetchMock.mockImplementation(() => reply({ ok: true }))

    await apiRequest('/api/v1/patients/')

    const [{ init }] = calls(fetchMock)
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-1')
    expect(init.credentials).toBe('omit')
  })

  it('renews the token and repeats the request once after a 401', async () => {
    fetchMock
      .mockImplementationOnce(() => reply({ detail: 'expired' }, 401))
      .mockImplementationOnce(() => reply(sessionBody('token-2')))
      .mockImplementationOnce(() => reply({ ok: true }))

    await expect(apiRequest('/api/v1/patients/')).resolves.toEqual({ ok: true })

    const sent = calls(fetchMock)
    expect(sent.map((call) => call.path)).toEqual([
      '/api/v1/patients/',
      '/api/v1/auth/refresh',
      '/api/v1/patients/',
    ])
    expect(new Headers(sent[2].init.headers).get('Authorization')).toBe('Bearer token-2')
  })

  it('signs the user out when the session cannot be renewed', async () => {
    const ended = vi.fn()
    const unsubscribe = onSessionEnded(ended)
    fetchMock
      .mockImplementationOnce(() => reply({ detail: 'expired' }, 401))
      .mockImplementationOnce(() => reply({ detail: 'Invalid or expired session' }, 401))

    await expect(apiRequest('/api/v1/patients/')).rejects.toMatchObject({
      kind: 'session',
      status: 401,
    })

    expect(ended).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('does not retry a request that was refused for another reason', async () => {
    fetchMock.mockImplementation(() => reply({ detail: 'Insufficient permissions' }, 403))

    await expect(apiRequest('/api/v1/patients/')).rejects.toBeInstanceOf(ApiError)

    expect(calls(fetchMock)).toHaveLength(1)
  })

  it('does not renew anything for a public request', async () => {
    fetchMock.mockImplementation(() => reply({ detail: 'nope' }, 401))

    await expect(apiRequest('/api/v1/plans/', {}, { authenticated: false })).rejects.toMatchObject({
      kind: 'unauthorized',
    })

    expect(calls(fetchMock)).toHaveLength(1)
  })
})

describe('sign in and sign out', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    clearSession()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('logs in with the cookie enabled and keeps the new token', async () => {
    fetchMock.mockImplementation(() => reply(sessionBody('fresh')))

    const session = await login('olena@example.com', 'correct-horse-battery')

    expect(session.user.email).toBe('olena@example.com')
    const [{ path, init }] = calls(fetchMock)
    expect(path).toBe('/api/v1/auth/login')
    expect(init.credentials).toBe('include')
    expect(init.body).toBe(
      JSON.stringify({ email: 'olena@example.com', password: 'correct-horse-battery' }),
    )
    expect(new Headers(init.headers).has('Authorization')).toBe(false)
    await expect(getValidAccessToken()).resolves.toBe('fresh')
  })

  it('forgets the token on logout even when the server is unreachable', async () => {
    setSession({ access_token: 'token', expires_in: 900 })
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(logout()).rejects.toBeInstanceOf(ApiError)

    fetchMock.mockImplementation(() => reply({ detail: 'expired' }, 401))
    await expect(getValidAccessToken()).rejects.toMatchObject({ reason: 'expired' })
  })
})
