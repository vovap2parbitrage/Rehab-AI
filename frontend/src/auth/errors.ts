export type AuthSessionErrorReason = 'not-authenticated' | 'expired' | 'missing-token'

export class AuthSessionError extends Error {
  readonly reason: AuthSessionErrorReason

  constructor(reason: AuthSessionErrorReason) {
    super(`Keycloak session error: ${reason}`)
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
    message: 'Keycloak очікує підтвердження входу. Спробуйте увійти ще раз.',
  },
  consent_required: {
    title: 'Потрібна згода',
    message: 'Щоб продовжити, надайте згоду на доступ до профілю в Keycloak.',
  },
  invalid_redirect_uri: {
    title: 'Неправильна адреса повернення',
    message:
      'Адреса вебзастосунку не зареєстрована в Keycloak. Перевірте Valid redirect URIs для клієнта rehab-ai-web.',
  },
  unauthorized_client: {
    title: 'Клієнт не авторизований',
    message:
      'Keycloak не дозволяє цьому вебклієнту виконувати вхід. Перевірте налаштування клієнта rehab-ai-web.',
  },
  invalid_request: {
    title: 'Некоректний запит авторизації',
    message: 'Keycloak відхилив запит. Перевірте налаштування клієнта та адресу повернення.',
  },
  invalid_scope: {
    title: 'Недостатній обсяг доступу',
    message: 'Запитані дозволи недоступні для цього клієнта Keycloak.',
  },
  temporarily_unavailable: {
    title: 'Сервіс авторизації недоступний',
    message: 'Keycloak тимчасово не може обробити вхід. Спробуйте пізніше.',
  },
  server_error: {
    title: 'Помилка сервера авторизації',
    message: 'Keycloak повернув помилку. Спробуйте увійти ще раз трохи пізніше.',
  },
}

export function describeAuthErrorCode(code: string | null | undefined): AuthErrorDescription {
  if (!code) {
    return {
      title: 'Не вдалося завершити авторизацію',
      message: 'Спробуйте увійти ще раз. Якщо проблема повторюється, перевірте налаштування Keycloak.',
    }
  }

  return (
    OAUTH_ERRORS[code] ?? {
      title: 'Помилка авторизації',
      message: 'Keycloak не зміг завершити вхід. Спробуйте ще раз або зверніться до адміністратора.',
    }
  )
}

export function describeKeycloakInitError(error: unknown): string {
  console.error('Keycloak initialization failed', error)

  if (error instanceof Error && error.message === 'KEYCLOAK_INIT_TIMEOUT') {
    return 'Сервер авторизації Keycloak не відповів вчасно. Перевірте, чи він запущений і доступний за адресою, вказаною у VITE_KEYCLOAK_URL.'
  }

  return 'Не вдалося підключитися до Keycloak. Перевірте, чи сервер авторизації запущений, а адреса та назва realm указані правильно.'
}

export function describeAuthActionError(error: unknown): string {
  console.error('Keycloak action failed', error)
  return 'Не вдалося перейти до сторінки Keycloak. Перевірте з’єднання та спробуйте ще раз.'
}
