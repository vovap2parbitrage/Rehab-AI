import { useState } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { describeAuthActionError, describeAuthErrorCode } from '../auth/errors'
import { AuthLayout } from '../components/AuthLayout'
import { ErrorMessage } from '../components/ErrorMessage'
import { CheckIcon, HeartPulseIcon, UserIcon } from '../components/Icons'
import {
  clearRegistrationRole,
  saveRegistrationRole,
  type RegistrationRole,
} from '../lib/registrationRole'

interface RegisterLocationState {
  from?: unknown
}

function readReturnPath(state: unknown): string {
  const from = (state as RegisterLocationState | null)?.from

  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')) {
    return from
  }

  return '/profile'
}

export function RegisterPage() {
  const { authenticated, initError, register } = useAuth()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [role, setRole] = useState<RegistrationRole>('patient')

  const returnPath = readReturnPath(location.state)
  const oauthCode = searchParams.get('error')
  const oauthDescription = oauthCode ? describeAuthErrorCode(oauthCode) : null

  if (authenticated) {
    return <Navigate to={returnPath} replace />
  }

  const handleRegister = async () => {
    setBusy(true)
    setActionError(null)
    saveRegistrationRole(role)

    try {
      await register(returnPath)
    } catch (error) {
      clearRegistrationRole()
      setActionError(describeAuthActionError(error))
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="Новий обліковий запис"
      title="Реєстрація в AIRehab"
      description="Оберіть, як ви будете користуватися AIRehab, і створіть захищений обліковий запис на сторінці Keycloak."
      icon={<UserIcon />}
      asideTitle="Почніть реабілітацію з правильного доступу"
      asideText="Пацієнт отримує доступ до власного кабінету одразу. Роль лікаря надає адміністратор після перевірки — запит надсилається автоматично після реєстрації."
      asidePoints={[
        'Реєстрація виконується в Keycloak, а не в AIRehab',
        'Пароль не передається до FastAPI та не зберігається фронтендом',
        'Після входу профіль створюється автоматично на backend',
        'Роль лікаря підтверджує адміністратор',
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

      {actionError && (
        <ErrorMessage title="Не вдалося розпочати реєстрацію" message={actionError} />
      )}

      <fieldset className="role-choice">
        <legend className="role-choice__legend">Я створюю обліковий запис як</legend>

        <div className="role-choice__options">
          <label
            className={
              role === 'patient' ? 'role-option role-option--selected' : 'role-option'
            }
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
            className={
              role === 'therapist' ? 'role-option role-option--selected' : 'role-option'
            }
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
            <strong>Роль лікаря потребує підтвердження.</strong> Акаунт створюється з базовим
            доступом пацієнта. Після реєстрації AIRehab автоматично надішле запит на роль
            терапевта — адміністратор розгляне його найближчим часом.
          </>
        ) : (
          <>
            <strong>Доступ пацієнта активний одразу.</strong> Ви зможете бачити власний план
            реабілітації, виконувати вправи та переглядати результати занять. Роль лікаря можна
            запросити пізніше у профілі.
          </>
        )}
      </div>

      <button
        type="button"
        className="button button--primary button--lg button--block"
        onClick={handleRegister}
        disabled={busy || Boolean(initError)}
      >
        {busy ? (
          <span className="spinner spinner--sm" aria-hidden="true" />
        ) : (
          <UserIcon aria-hidden="true" />
        )}
        {busy
          ? 'Відкриваємо реєстрацію…'
          : role === 'therapist'
            ? 'Зареєструватися як лікар'
            : 'Зареєструватися як пацієнт'}
      </button>

      <p className="auth-card__fineprint">
        Натискаючи кнопку, ви перейдете до форми реєстрації Keycloak. Дані облікового запису
        зберігаються в Keycloak, а AIRehab отримує лише підтверджений профіль.
      </p>
    </AuthLayout>
  )
}
