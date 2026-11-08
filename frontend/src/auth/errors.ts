export type AuthSessionErrorReason = 'not-authenticated' | 'expired' | 'missing-token'

export class AuthSessionError extends Error {
  readonly reason: AuthSessionErrorReason

  constructor(reason: AuthSessionErrorReason) {
    super(`Authentication session error: ${reason}`)
    this.name = 'AuthSessionError'
    this.reason = reason
  }
}

export interface AuthErrorDescription {
  title: string
  message: string
}

const OAUTH_ERRORS: Record<string, AuthErrorDescription> = {
  access_denied: {
    title: 'Вхід скасовано',
    message: 'Доступ до облікового запису не надано. Спробуйте увійти ще раз.',
  },
  login_required: {
    title: 'Потрібен вхід',
    message: 'Сесія завершилася або ви ще не увійшли в систему. Увійдіть, щоб продовжити.',
  },
  interaction_required: {
    title: 'Потрібна додаткова дія',
    message: 'Потрібне підтвердження входу. Спробуйте увійти ще раз.',
  },
  consent_required: {
    title: 'Потрібна згода',
    message: 'Щоб продовжити, надайте згоду на доступ до профілю.',
  },
  invalid_redirect_uri: {
    title: 'Неправильна адреса повернення',
    message:
      'Адреса вебзастосунку не зареєстрована в сервісі авторизації.',
  },
  unauthorized_client: {
    title: 'Клієнт не авторизований',
    message:
      'Сервіс авторизації не дозволяє виконати вхід.',
  },
  invalid_request: {
    title: 'Некоректний запит авторизації',
    message: 'Запит авторизації відхилено. Спробуйте ще раз.',
  },
  invalid_scope: {
    title: 'Недостатній обсяг доступу',
    message: 'Запитані дозволи недоступні.',
  },
  temporarily_unavailable: {
    title: 'Сервіс авторизації недоступний',
    message: 'Сервіс авторизації тимчасово недоступний. Спробуйте пізніше.',
  },
  server_error: {
    title: 'Помилка сервера авторизації',
    message: 'Сервіс авторизації повернув помилку. Спробуйте увійти ще раз пізніше.',
  },
}

export function describeAuthErrorCode(code: string | null | undefined): AuthErrorDescription {
  if (!code) {
    return {
      title: 'Не вдалося завершити авторизацію',
      message: 'Спробуйте увійти ще раз.',
    }
  }

  return (
    OAUTH_ERRORS[code] ?? {
      title: 'Помилка авторизації',
      message: 'Не вдалося завершити вхід. Спробуйте ще раз',
    }
  )
}

export function describeKeycloakInitError(error: unknown): string {
  console.error('Keycloak initialization failed', error)

  if (error instanceof Error && error.message === 'KEYCLOAK_INIT_TIMEOUT') {
    return 'Сервер авторизації не відповів вчасно. Спробуйте ще раз пізніше.'
  }

  return 'Не вдалося підключитися до сервісу авторизації. Спробуйте ще раз пізніше.'
}

export function describeAuthActionError(error: unknown): string {
  console.error('Keycloak action failed', error)
  return 'Не вдалося відкрити сторінку входу. Перевірте з’єднання та спробуйте ще раз.'
}
