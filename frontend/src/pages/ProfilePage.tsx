import { useState, useEffect, type ReactNode } from 'react'
import { ApiError } from '../api/client'
import {
  fetchCurrentUser,
  isSessionError,
  requestTherapistRole,
  type UserProfile,
} from '../api/auth'
import { useAuth } from '../auth/useAuth'
import { describeAuthActionError } from '../auth/errors'
import { ErrorMessage } from '../components/ErrorMessage'
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  HeartPulseIcon,
  LockIcon,
  LogoutIcon,
  MailIcon,
  RefreshIcon,
  ShieldCheckIcon,
  UserIcon,
} from '../components/Icons'
import { Loading } from '../components/Loading'
import { RoleBadge } from '../components/RoleBadge'
import {
  getDisplayName,
  getFirstName,
  getInitials,
  getLastName,
  getRoleDescription,
  getRoleLabel,
  getUsername,
} from '../lib/profile'
import { consumeRegistrationRole } from '../lib/registrationRole'

const UNKNOWN_ERROR =
  'Не вдалося завантажити профіль. Перевірте з’єднання з сервером і спробуйте ще раз.'

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError
    ? error
    : new ApiError(UNKNOWN_ERROR, 'unknown')
}

function Detail({
  label,
  icon,
  children,
}: {
  label: string
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="detail">
      <dt className="detail__label">
        {icon && (
          <span className="detail__icon" aria-hidden="true">
            {icon}
          </span>
        )}
        {label}
      </dt>
      <dd className="detail__value">{children}</dd>
    </div>
  )
}

function valueOrFallback(value: string): string {
  return value || 'Не вказано'
}

export function ProfilePage() {
  const { tokenParsed, login, logout } = useAuth()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)

  const [isRequestingRole, setIsRequestingRole] = useState(false)
  const [roleRequestError, setRoleRequestError] = useState<string | null>(null)
  const [roleRequestSuccess, setRoleRequestSuccess] = useState<string | null>(null)

  const reloadProfile = () => {
    setIsLoading(true)
    setError(null)
    setReloadKey((value) => value + 1)
  }

  useEffect(() => {
    const controller = new AbortController()

    fetchCurrentUser({ signal: controller.signal })
      .then((user) => {
        if (controller.signal.aborted) {
          return
        }

        setProfile(user)

        // A therapist role picked on the registration page becomes a request for an
        // administrator. The backend never grants a role from this browser-only intent.
        const intent = consumeRegistrationRole()

        if (
          intent !== 'therapist' ||
          user.role !== 'patient' ||
          user.pending_role !== null ||
          !user.is_active
        ) {
          return
        }

        setIsRequestingRole(true)
        setRoleRequestError(null)
        setRoleRequestSuccess(null)

        requestTherapistRole()
          .then((updated) => {
            if (controller.signal.aborted) {
              return
            }

            setProfile(updated)
            setRoleRequestSuccess(
              'Ви обрали роль лікаря під час реєстрації. Запит на роль терапевта надіслано — адміністратор розгляне його найближчим часом.',
            )
          })
          .catch((caught: unknown) => {
            if (!controller.signal.aborted) {
              setRoleRequestError(asApiError(caught).message)
            }
          })
          .finally(() => {
            if (!controller.signal.aborted) {
              setIsRequestingRole(false)
            }
          })
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(asApiError(caught))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      })

    return () => controller.abort()
  }, [reloadKey])

  const handleLogout = async () => {
    setIsLoggingOut(true)
    setLogoutError(null)

    try {
      await logout()
    } catch (caught) {
      console.error('Logout failed', caught)
      setLogoutError(
        'Не вдалося коректно завершити сесію в Keycloak. Оновіть сторінку та спробуйте ще раз.',
      )
      setIsLoggingOut(false)
    }
  }

  const handleReLogin = () => {
    setLoginError(null)
    login('/profile').catch((caught: unknown) => {
      setLoginError(describeAuthActionError(caught))
    })
  }

  const handleRoleRequest = async () => {
    setIsRequestingRole(true)
    setRoleRequestError(null)
    setRoleRequestSuccess(null)

    try {
      const updated = await requestTherapistRole()
      setProfile(updated)
      setRoleRequestSuccess(
        'Запит на роль терапевта надіслано. Адміністратор розгляне його найближчим часом.',
      )
    } catch (caught) {
      const apiError = asApiError(caught)
      setRoleRequestError(apiError.message)
    } finally {
      setIsRequestingRole(false)
    }
  }

  const displayName = getDisplayName(tokenParsed)
  const initials = getInitials(displayName)
  const firstName = getFirstName(tokenParsed)
  const lastName = getLastName(tokenParsed)
  const username = getUsername(tokenParsed)

  const canRequestTherapistRole =
    profile !== null &&
    profile.role === 'patient' &&
    profile.pending_role === null &&
    profile.is_active

  return (
    <div className="profile-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Особистий кабінет</p>
          <h1>Мій профіль</h1>
          <p className="page-heading__lead">
            Дані облікового запису, роль і статус доступу до реабілітаційної платформи.
          </p>
        </div>

        <button
          type="button"
          className="button button--ghost button--sm"
          onClick={reloadProfile}
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="spinner spinner--sm" aria-hidden="true" />
          ) : (
            <RefreshIcon aria-hidden="true" />
          )}
          Оновити дані
        </button>
      </header>

      {isLoading && <Loading fullPage label="Завантажуємо профіль…" />}

      {!isLoading && error && (
        <div className="profile-error">
          <ErrorMessage
            title={isSessionError(error) ? 'Сесія завершилася' : 'Не вдалося отримати профіль'}
            message={error.message}
            code={error.status > 0 ? error.status : undefined}
            onRetry={reloadProfile}
          >
            {isSessionError(error) && (
              <button
                type="button"
                className="button button--primary button--sm"
                onClick={handleReLogin}
              >
                Увійти знову
              </button>
            )}
          </ErrorMessage>

          {loginError && <ErrorMessage title="Не вдалося відкрити вхід" message={loginError} />}
        </div>
      )}

      {!isLoading && !error && profile && (
        <div className="profile-layout">
          <aside className="profile-sidebar">
            <section className="card profile-identity" aria-labelledby="identity-name">
              <span className="avatar avatar--xl" aria-hidden="true">
                {initials}
              </span>

              <h2 id="identity-name">{displayName}</h2>
              {username && <p className="profile-identity__username">@{username}</p>}

              <RoleBadge role={profile.role} />

              <span
                className={
                  profile.is_active
                    ? 'status-pill status-pill--success'
                    : 'status-pill status-pill--danger'
                }
              >
                <span className="status-pill__dot" aria-hidden="true" />
                {profile.is_active ? 'Обліковий запис активний' : 'Обліковий запис неактивний'}
              </span>

              <p className="profile-identity__role-text">{getRoleDescription(profile.role)}</p>
            </section>

            <section className="card session-card" aria-labelledby="session-title">
              <span className="session-card__icon" aria-hidden="true">
                <ShieldCheckIcon />
              </span>
              <h2 id="session-title">Захищена сесія</h2>
              <p>
                Ви увійшли через Keycloak. Токен доступу зберігається лише в пам’яті браузера
                та автоматично оновлюється перед запитами.
              </p>

              <ul className="session-card__list">
                <li>
                  <CheckIcon aria-hidden="true" />
                  Authorization Code Flow + PKCE
                </li>
                <li>
                  <CheckIcon aria-hidden="true" />
                  Пароль не передається до AIRehab
                </li>
              </ul>

              {logoutError && <p className="form-error">{logoutError}</p>}

              <button
                type="button"
                className="button button--danger-ghost button--block"
                onClick={handleLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? (
                  <span className="spinner spinner--sm" aria-hidden="true" />
                ) : (
                  <LogoutIcon aria-hidden="true" />
                )}
                {isLoggingOut ? 'Завершуємо сесію…' : 'Вийти'}
              </button>
            </section>
          </aside>

          <div className="profile-main">
            <section className="card" aria-labelledby="personal-title">
              <div className="card__header">
                <div>
                  <h2 id="personal-title">Особисті дані</h2>
                  <p>Ім’я та username надходять із підписаного токена Keycloak.</p>
                </div>
                <span className="card__header-icon" aria-hidden="true">
                  <UserIcon />
                </span>
              </div>

              <dl className="details-grid">
                <Detail label="Ім’я">{valueOrFallback(firstName)}</Detail>
                <Detail label="Прізвище">{valueOrFallback(lastName)}</Detail>
                <Detail label="Email" icon={<MailIcon />}>
                  {profile.email}
                </Detail>
                <Detail label="Ім’я користувача">
                  {username ? `@${username}` : 'Не вказано'}
                </Detail>
              </dl>
            </section>

            <section className="card" aria-labelledby="account-title">
              <div className="card__header">
                <div>
                  <h2 id="account-title">Обліковий запис</h2>
                  <p>Роль і статус визначені сервером AIRehab, а не даними браузера.</p>
                </div>
                <span className="card__header-icon" aria-hidden="true">
                  <LockIcon />
                </span>
              </div>

              <dl className="details-grid">
                <Detail label="Роль">
                  <RoleBadge role={profile.role} size="sm" />
                </Detail>
                <Detail label="Статус">
                  <span
                    className={
                      profile.is_active
                        ? 'status-pill status-pill--success status-pill--sm'
                        : 'status-pill status-pill--danger status-pill--sm'
                    }
                  >
                    <span className="status-pill__dot" aria-hidden="true" />
                    {profile.is_active ? 'Активний' : 'Неактивний'}
                  </span>
                </Detail>
                <Detail label="Запит на роль">
                  {profile.pending_role ? (
                    <span className="pending-role">
                      <ClockIcon aria-hidden="true" />
                      {getRoleLabel(profile.pending_role)}
                    </span>
                  ) : (
                    'Немає активних запитів'
                  )}
                </Detail>
                <Detail label="Доступ до платформи">
                  {profile.is_active ? 'Дозволено' : 'Заблоковано'}
                </Detail>
              </dl>

              <details className="technical-details">
                <summary>Технічні дані облікового запису</summary>
                <dl className="details-grid details-grid--technical">
                  <Detail label="ID профілю AIRehab">
                    <code>{profile.id}</code>
                  </Detail>
                  <Detail label="Keycloak sub">
                    {profile.keycloak_sub ? <code>{profile.keycloak_sub}</code> : 'Не пов’язано'}
                  </Detail>
                </dl>
              </details>
            </section>

            {roleRequestSuccess && (
              <div className="success-message" role="status">
                <CheckIcon aria-hidden="true" />
                <span>{roleRequestSuccess}</span>
              </div>
            )}

            {profile.pending_role && (
              <section className="card status-card status-card--pending" aria-labelledby="pending-title">
                <span className="status-card__icon" aria-hidden="true">
                  <ClockIcon />
                </span>
                <div>
                  <h2 id="pending-title">Запит на роль «{getRoleLabel(profile.pending_role)}»</h2>
                  <p>
                    Запит очікує підтвердження адміністратора. Після зміни ролі повторно
                    увійдіть або оновіть профіль, щоб отримати актуальний доступ.
                  </p>
                </div>
              </section>
            )}

            {canRequestTherapistRole && (
              <section className="card role-request-card" aria-labelledby="role-request-title">
                <span className="role-request-card__icon" aria-hidden="true">
                  <HeartPulseIcon />
                </span>

                <div className="role-request-card__content">
                  <h2 id="role-request-title">Працюєте терапевтом?</h2>
                  <p>
                    Надішліть запит адміністратору, щоб отримати доступ до роботи з пацієнтами,
                    призначення вправ і перегляду результатів сесій.
                  </p>

                  {roleRequestError && <p className="form-error">{roleRequestError}</p>}

                  <button
                    type="button"
                    className="button button--primary"
                    onClick={handleRoleRequest}
                    disabled={isRequestingRole}
                  >
                    {isRequestingRole ? (
                      <span className="spinner spinner--sm" aria-hidden="true" />
                    ) : (
                      <ArrowRightIcon aria-hidden="true" />
                    )}
                    {isRequestingRole ? 'Надсилаємо запит…' : 'Запросити роль терапевта'}
                  </button>

                  <p className="role-request-card__hint">
                    Роль не змінюється автоматично: її підтверджує адміністратор у Keycloak.
                  </p>
                </div>
              </section>
            )}

            <section className="card account-meta" aria-labelledby="meta-title">
              <span className="account-meta__icon" aria-hidden="true">
                <CalendarIcon />
              </span>
              <div>
                <h2 id="meta-title">Доступ до даних</h2>
                <p>
                  Ваші реабілітаційні дані доступні лише вам, призначеному терапевту та
                  адміністраторам відповідно до ролі. Для зміни ролі зверніться до адміністратора
                  закладу.
                </p>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
