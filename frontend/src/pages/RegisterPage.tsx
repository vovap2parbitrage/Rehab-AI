import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import type { RegisterInput } from '../api/auth'
import { useAuth } from '../auth/useAuth'
import { describeAuthError } from '../auth/messages'
import { readReturnPath } from '../auth/returnPath'
import { AuthLayout } from '../components/AuthLayout'
import { ErrorMessage } from '../components/ErrorMessage'
import { CheckIcon, HeartPulseIcon, UserIcon } from '../components/Icons'

const MIN_PASSWORD_LENGTH = 12

export function RegisterPage() {
  const { authenticated, initError, register } = useAuth()
  const location = useLocation()
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [role, setRole] = useState<RegisterInput['role']>('patient')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  const returnPath = readReturnPath(location.state)

  if (authenticated) {
    return <Navigate to={returnPath} replace />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setActionError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setActionError(`Пароль має містити щонайменше ${MIN_PASSWORD_LENGTH} символів.`)
      return
    }

    setBusy(true)

    try {
      await register({
        email: email.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        role,
      })
    } catch (error) {
      setActionError(describeAuthError(error, 'register'))
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="Новий обліковий запис"
      title="Реєстрація в AIRehab"
      description="Оберіть, як ви будете користуватися AIRehab, і створіть захищений обліковий запис."
      icon={<UserIcon />}
      asideTitle="Почніть реабілітацію з правильного доступу"
      asideText="Пацієнт і лікар отримують доступ до свого кабінету одразу після реєстрації."
      asidePoints={[
        'Пароль зберігається лише у вигляді хешу',
        'Кабінет лікаря доступний одразу після реєстрації',
      ]}
      footer={
        <>
          Вже маєте обліковий запис?{' '}
          <Link to="/login" className="text-link">
            Увійти
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

      {actionError && <ErrorMessage title="Не вдалося зареєструватися" message={actionError} />}

      <form className="auth-form" onSubmit={handleSubmit}>
        <fieldset className="role-choice">
          <legend className="role-choice__legend">Я створюю обліковий запис як</legend>

          <div className="role-choice__options">
            <label
              className={role === 'patient' ? 'role-option role-option--selected' : 'role-option'}
            >
              <input
                type="radio"
                name="registration-role"
                value="patient"
                checked={role === 'patient'}
                onChange={() => setRole('patient')}
                className="role-option__input"
              />
              <span className="role-option__icon" aria-hidden="true">
                <UserIcon />
              </span>
              <span className="role-option__body">
                <span className="role-option__title">Пацієнт</span>
                <span className="role-option__text">
                  Власний кабінет, план реабілітації та результати занять.
                </span>
              </span>
              <span className="role-option__check" aria-hidden="true">
                <CheckIcon />
              </span>
            </label>

            <label
              className={role === 'therapist' ? 'role-option role-option--selected' : 'role-option'}
            >
              <input
                type="radio"
                name="registration-role"
                value="therapist"
                checked={role === 'therapist'}
                onChange={() => setRole('therapist')}
                className="role-option__input"
              />
              <span className="role-option__icon" aria-hidden="true">
                <HeartPulseIcon />
              </span>
              <span className="role-option__body">
                <span className="role-option__title">Лікар</span>
                <span className="role-option__text">
                  Робота з пацієнтами, призначення вправ і контроль прогресу.
                </span>
              </span>
              <span className="role-option__check" aria-hidden="true">
                <CheckIcon />
              </span>
            </label>
          </div>
        </fieldset>

        <div className="info-note" aria-live="polite">
          {role === 'therapist' ? (
            <>
              <strong>Доступ лікаря активний одразу.</strong> Ви зможете запрошувати пацієнтів,
              призначати вправи та стежити за прогресом. Роль обирається під час реєстрації й
              пізніше не змінюється.
            </>
          ) : (
            <>
              <strong>Доступ пацієнта активний одразу.</strong> Ви зможете бачити власний план
              реабілітації, виконувати вправи та переглядати результати занять.
            </>
          )}
        </div>

        <div className="form-row">
          <label className="form-field">
            <span>Ім’я</span>
            <input
              type="text"
              name="given-name"
              autoComplete="given-name"
              maxLength={100}
              value={firstName}
              onChange={(event) => setFirstName(event.currentTarget.value)}
              required
            />
          </label>

          <label className="form-field">
            <span>Прізвище</span>
            <input
              type="text"
              name="family-name"
              autoComplete="family-name"
              maxLength={100}
              value={lastName}
              onChange={(event) => setLastName(event.currentTarget.value)}
              required
            />
          </label>
        </div>

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
            name="new-password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
          />
          <span className="form-field__hint">
            Щонайменше {MIN_PASSWORD_LENGTH} символів. Фраза з кількох слів підійде найкраще.
          </span>
        </label>

        <button
          type="submit"
          className="button button--primary button--lg button--block"
          disabled={busy || Boolean(initError)}
        >
          {busy ? (
            <span className="spinner spinner--sm" aria-hidden="true" />
          ) : (
            <UserIcon aria-hidden="true" />
          )}
          {busy
            ? 'Створюємо обліковий запис…'
            : role === 'therapist'
              ? 'Зареєструватися як лікар'
              : 'Зареєструватися як пацієнт'}
        </button>
      </form>
    </AuthLayout>
  )
}
