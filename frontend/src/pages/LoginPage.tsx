import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { describeAuthError } from '../auth/messages'
import { readReturnPath } from '../auth/returnPath'
import { AuthLayout } from '../components/AuthLayout'
import { ErrorMessage } from '../components/ErrorMessage'
import { LockIcon } from '../components/Icons'

export function LoginPage() {
  const { authenticated, initError, login } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const returnPath = readReturnPath(location.state)

  if (authenticated) {
    return <Navigate to={returnPath} replace />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setActionError(null)

    try {
      await login(email.trim(), password)
    } catch (error) {
      setActionError(describeAuthError(error, 'login'))
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="Захищений вхід"
      title="Вхід до AIRehab"
      description="Увійдіть, щоб відкрити свій профіль, план реабілітації та результати занять."
      icon={<LockIcon />}
      asideTitle="Один захищений вхід до всіх даних"
      asideText="Пароль зберігається лише у вигляді хешу, а сесія захищена короткоживучими токенами."
      asidePoints={[
        'Сесія завершується, коли ви виходите',
        'Після кількох невдалих спроб вхід тимчасово блокується',
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
      {initError && (
        <ErrorMessage
          title="Сервер недоступний"
          message={initError}
          onRetry={() => window.location.reload()}
          retryLabel="Перевірити знову"
        />
      )}

      {actionError && <ErrorMessage title="Не вдалося увійти" message={actionError} />}

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            required
          />
        </label>

        <label className="form-field">
          <span>Пароль</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
          />
        </label>

        <button
          type="submit"
          className="button button--primary button--lg button--block"
          disabled={busy || Boolean(initError)}
        >
          {busy ? (
            <span className="spinner spinner--sm" aria-hidden="true" />
          ) : (
            <LockIcon aria-hidden="true" />
          )}
          {busy ? 'Входимо…' : 'Увійти'}
        </button>
      </form>
    </AuthLayout>
  )
}
