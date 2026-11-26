import { AuthSessionError } from '../auth/errors'
import { clearSession, getValidAccessToken, refreshSession } from '../auth/session'
import { appConfig } from '../config/appConfig'

export interface RequestOptions {
  signal?: AbortSignal
}

export type ApiErrorKind =
  | 'network'
  | 'session'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'validation'
  | 'server'
  | 'unavailable'
  | 'unknown'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number
  readonly detail?: string
  readonly code?: string

  constructor(message: string, kind: ApiErrorKind, status = 0, detail?: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.detail = detail
    this.code = code
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Сервер відхилив запит. Перевірте дані та спробуйте ще раз.',
  401: 'Сесія завершилася або токен недійсний. Увійдіть знову, щоб продовжити.',
  403: 'Доступ заборонено. Можливо, обліковий запис неактивний або недостатньо прав.',
  404: 'Запитувані дані не знайдено.',
  409: 'Дію неможливо виконати через конфлікт даних.',
  422: 'Сервер відхилив дані запиту.',
  429: 'Забагато запитів. Спробуйте трохи пізніше.',
  500: 'Сервер AIRehab тимчасово недоступний. Спробуйте пізніше.',
  502: 'Сервер AIRehab тимчасово недоступний. Спробуйте пізніше.',
  503: 'Сервіс AIRehab тимчасово недоступний. Спробуйте пізніше.',
  504: 'Сервер AIRehab не відповів вчасно. Спробуйте пізніше.',
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 409) return 'conflict'
  if (status === 422) return 'validation'
  if (status === 503) return 'unavailable'
  if (status >= 500) return 'server'
  return 'unknown'
}

export const PATIENT_LIMIT_REACHED = 'patient_limit_reached'

const CODE_MESSAGES: Record<string, string> = {
  [PATIENT_LIMIT_REACHED]:
    'Досягнуто ліміту активних пацієнтів за тарифом лікаря. Щоб продовжити, лікарю потрібно звільнити місце (заархівувати пацієнта) або обрати вищий тариф.',
}

function messageForStatus(status: number, code?: string): string {
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code]
  return (
    STATUS_MESSAGES[status] ??
    (status >= 500
      ? 'Сервер AIRehab тимчасово недоступний. Спробуйте пізніше.'
      : 'Не вдалося виконати запит. Спробуйте ще раз.')
  )
}

async function readErrorBody(response: Response): Promise<{ detail?: string; code?: string }> {
  try {
    const body: unknown = await response.json()

    if (typeof body === 'object' && body !== null) {
      const code = 'code' in body && typeof body.code === 'string' ? body.code : undefined

      if ('detail' in body) {
        const detail = (body as { detail: unknown }).detail

        if (typeof detail === 'string') {
          return { detail, code }
        }

        if (Array.isArray(detail)) {
          return {
            detail: detail
              .map((item) => {
                if (typeof item === 'object' && item !== null && 'msg' in item) {
                  return String((item as { msg: unknown }).msg)
                }
                return String(item)
              })
              .join('; '),
            code,
          }
        }
      }

      return { code }
    }
  } catch {
    // The response body is not JSON; the status code is enough.
  }

  return {}
}

const NETWORK_MESSAGE =
  'Не вдалося з’єднатися з сервером AIRehab. Перевірте, чи backend запущений і доступний.'
const SESSION_MESSAGE = 'Сесія завершилася. Увійдіть знову, щоб отримати доступ до профілю.'

async function withAccessToken(headers: Headers): Promise<void> {
  try {
    headers.set('Authorization', `Bearer ${await getValidAccessToken()}`)
  } catch (error) {
    if (error instanceof AuthSessionError) {
      throw error.reason === 'unavailable'
        ? new ApiError(NETWORK_MESSAGE, 'network', 0)
        : new ApiError(SESSION_MESSAGE, 'session', 401)
    }

    throw error
  }
}

async function send(
  path: string,
  init: RequestInit,
  headers: Headers,
  credentials: RequestCredentials,
): Promise<Response> {
  try {
    return await fetch(`${appConfig.apiBaseUrl}${path}`, {
      ...init,
      headers,
      credentials,
      cache: init.cache ?? 'no-store',
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    throw new ApiError(NETWORK_MESSAGE, 'network', 0)
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  {
    authenticated = true,
    credentials = 'omit',
  }: { authenticated?: boolean; credentials?: RequestCredentials } = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')

  if (authenticated) {
    await withAccessToken(headers)
  }

  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response = await send(path, init, headers, credentials)

  // The access token may have been revoked (for example by a password change on
  // another device). Renew it once with the refresh cookie and repeat the request.
  if (authenticated && response.status === 401) {
    let renewed = null
    try {
      renewed = await refreshSession()
    } catch {
      throw new ApiError(NETWORK_MESSAGE, 'network', 0)
    }

    if (!renewed) {
      clearSession()
      throw new ApiError(SESSION_MESSAGE, 'session', 401)
    }

    headers.set('Authorization', `Bearer ${renewed.access_token}`)
    response = await send(path, init, headers, credentials)
  }

  if (!response.ok) {
    const { detail, code } = await readErrorBody(response)
    throw new ApiError(
      messageForStatus(response.status, code),
      kindForStatus(response.status),
      response.status,
      detail,
      code,
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  try {
    return (await response.json()) as T
  } catch {
    throw new ApiError('Сервер повернув неочікувану відповідь.', 'server', response.status)
  }
}
