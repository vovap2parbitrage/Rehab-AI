import { useState } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { describeAuthActionError, describeAuthErrorCode } from '../auth/errors'
import { AuthLayout } from '../components/AuthLayout'
import { ErrorMessage } from '../components/ErrorMessage'
import { LockIcon, ShieldCheckIcon } from '../components/Icons'

interface LoginLocationState {
  from?: unknown
}

function readReturnPath(state: unknown): string {
  const from = (state as LoginLocationState | null)?.from

  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')) {
    return from
  }

  return '/profile'
}

export function LoginPage() {
  const { initialized, authenticated, initError, login } = useAuth()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const returnPath = readReturnPath(location.state)
  const oauthCode = searchParams.get('error')
  const oauthDescription = oauthCode ? describeAuthErrorCode(oauthCode) : null

  if (authenticated) {
    return <Navigate to={returnPath} replace />
  }

  const handleLogin = async () => {
    setBusy(true)
    setActionError(null)

    try {
      await login(returnPath)
    } catch (error) {
      setActionError(describeAuthActionError(error))
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="Захищений вхід"
      title="Вхід до AIRehab"
      description="Увійдіть через Keycloak, щоб відкрити свій профіль, план реабілітації та результати занять."
      icon={<LockIcon />}
      asideTitle="Один захищений вхід до всіх даних"
      asideText="Keycloak перевіряє ваш пароль і керує сесією. AIRehab отримує лише короткоживучий токен доступу."
      asidePoints={[
        'Пароль вводиться лише на сторінці Keycloak',
        'Захист Authorization Code Flow із PKCE',
        'Токен зберігається в пам’яті та оновлюється автоматично',
        'Роль і статус облікового запису визначає сервер',
      ]}
      footer={
        <>
          Ще не маєте облікового запису?{' '}
          <Link to="/register" className="text-link">
            Зареєструватися
          </Link>
        </>
      }
    >
      {oauthDescription && (
        <ErrorMessage
          title={oauthDescription.title}
          message={oauthDescription.message}
          code={oauthCode ?? undefined}
        />
      )}

      {initError && (
        <ErrorMessage
          title="Keycloak недоступний"
          message={initError}
          onRetry={() => window.location.reload()}
          retryLabel="Перевірити знову"
        />
      )}

      {actionError && <ErrorMessage title="Не вдалося розпочати вхід" message={actionError} />}

      <button
        type="button"
        className="button button--primary button--lg button--block"
        onClick={handleLogin}
        disabled={busy || Boolean(initError)}
      >
        {busy ? (
          <span className="spinner spinner--sm" aria-hidden="true" />
        ) : (
          <LockIcon aria-hidden="true" />
        )}
        {busy ? 'Переходимо до Keycloak…' : 'Увійти через Keycloak'}
      </button>

      <p className="auth-card__fineprint">
        <ShieldCheckIcon aria-hidden="true" />
        {initialized
          ? 'Ви будете перенаправлені на захищену сторінку Keycloak. Після входу повернетеся до профілю.'
          : 'Перевіряємо наявну сесію Keycloak…'}
      </p>
    </AuthLayout>
  )
}
