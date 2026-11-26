import { ApiError } from '../api/client'

export function describeInitError(error: unknown): string {
  console.error('Session restore failed', error)

  if (error instanceof Error && error.message === 'SESSION_INIT_TIMEOUT') {
    return 'Сервер не відповів вчасно. Спробуйте ще раз пізніше.'
  }

  return 'Не вдалося підключитися до сервера. Спробуйте ще раз пізніше.'
}

export function describeAuthError(error: unknown, flow: 'login' | 'register'): string {
  if (!(error instanceof ApiError)) {
    console.error('Authentication request failed', error)
    return 'Не вдалося виконати запит. Спробуйте ще раз.'
  }

  if (flow === 'login' && error.status === 401) return 'Невірний email або пароль.'
  if (error.status === 403) return 'Обліковий запис заблоковано.'
  if (flow === 'register' && error.status === 409) {
    return 'Користувач із таким email уже зареєстрований.'
  }
  if (error.status === 422) {
    return 'Перевірте дані. Пароль має містити щонайменше 12 символів і не бути надто простим.'
  }

  return error.message
}
