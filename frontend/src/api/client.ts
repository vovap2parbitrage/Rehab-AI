import { AuthSessionError } from '../auth/errors'
import { getValidAccessToken } from '../auth/keycloak'
import { appConfig } from '../config/appConfig'

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

  constructor(message: string, kind: ApiErrorKind, status = 0, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.detail = detail
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

function messageForStatus(status: number): string {
  return (
    STATUS_MESSAGES[status] ??
    (status >= 500
      ? 'Сервер AIRehab тимчасово недоступний. Спробуйте пізніше.'
      : 'Не вдалося виконати запит. Спробуйте ще раз.')
  )
}

async function readErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json()

    if (typeof body === 'object' && body !== null && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail

      if (typeof detail === 'string') {
        return detail
      }

      if (Array.isArray(detail)) {
        return detail
          .map((item) => {
            if (typeof item === 'object' && item !== null && 'msg' in item) {
              return String((item as { msg: unknown }).msg)
            }
            return String(item)
          })
          .join('; ')
      }
    }
  } catch {
    // The response body is not JSON; the status code is enough.
  }

  return undefined
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let token: string

  try {
    token = await getValidAccessToken()
  } catch (error) {
    if (error instanceof AuthSessionError) {
      throw new ApiError(
        'Сесія завершилася. Увійдіть знову, щоб отримати доступ до профілю.',
        'session',
        401,
      )
    }

    throw error
  }

  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  headers.set('Authorization', `Bearer ${token}`)

  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response

  try {
    response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      ...init,
      headers,
      credentials: 'omit',
      cache: init.cache ?? 'no-store',
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    throw new ApiError(
      'Не вдалося з’єднатися з сервером AIRehab. Перевірте, чи backend запущений і доступний.',
      'network',
      0,
    )
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response)
    throw new ApiError(messageForStatus(response.status), kindForStatus(response.status), response.status, detail)
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
