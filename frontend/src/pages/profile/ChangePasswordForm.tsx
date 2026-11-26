import { useState, type FormEvent } from 'react'
import { changePassword } from '../../api/auth'
import { ApiError } from '../../api/client'
import { ErrorMessage } from '../../components/ErrorMessage'
import { CheckIcon, LockIcon } from '../../components/Icons'

const MIN_PASSWORD_LENGTH = 12

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return 'Поточний пароль неправильний.'
    if (error.status === 422) {
      return 'Новий пароль надто простий або збігається з поточним.'
    }
    return error.message
  }

  return 'Не вдалося змінити пароль. Спробуйте ще раз.'
}

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setDone(false)

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Новий пароль має містити щонайменше ${MIN_PASSWORD_LENGTH} символів.`)
      return
    }

    setBusy(true)
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setDone(true)
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card" aria-labelledby="password-title">
      <div className="card__header">
        <div>
          <h2 id="password-title">Зміна пароля</h2>
        </div>
        <span className="card__header-icon" aria-hidden="true">
          <LockIcon />
        </span>
      </div>

      {error && <ErrorMessage title="Пароль не змінено" message={error} />}

      {done && (
        <div className="success-message" role="status">
          <CheckIcon aria-hidden="true" />
          <span>Пароль змінено. На інших пристроях потрібно буде увійти знову.</span>
        </div>
      )}

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Поточний пароль</span>
          <input
            type="password"
            name="current-password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.currentTarget.value)}
            required
          />
        </label>

        <label className="form-field">
          <span>Новий пароль</span>
          <input
            type="password"
            name="new-password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={newPassword}
            onChange={(event) => setNewPassword(event.currentTarget.value)}
            required
          />
          <span className="form-field__hint">Щонайменше {MIN_PASSWORD_LENGTH} символів.</span>
        </label>

        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? 'Змінюємо…' : 'Змінити пароль'}
        </button>
      </form>
    </section>
  )
}
