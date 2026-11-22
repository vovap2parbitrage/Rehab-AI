import { useState } from 'react'
import { isSessionError } from '../../api/auth'
import { describeAuthActionError } from '../../auth/errors'
import { useAuth } from '../../auth/useAuth'
import { ErrorMessage } from '../../components/ErrorMessage'
import { RefreshIcon } from '../../components/Icons'
import { Loading } from '../../components/Loading'
import { PageHeading } from '../../components/PageHeading'
import { getDisplayName, getFirstName, getLastName, getUsername } from '../../lib/profile'
import { ProfileDataAccess, ProfileDetails } from './ProfileDetails'
import { ProfileRoleRequest } from './ProfileRoleRequest'
import { ProfileSidebar } from './ProfileSidebar'
import { useProfileRoleRequest } from './useProfileRoleRequest'

export function ProfilePage() {
  const { tokenParsed, login, logout, user: profile, userLoading, userError: error, refreshUser } = useAuth()
  const {
    isRequestingRole,
    roleRequestError,
    roleRequestSuccess,
    handleRoleRequest,
  } = useProfileRoleRequest()

  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    setLogoutError(null)

    try {
      await logout()
    } catch (caught) {
      console.error('Logout failed', caught)
      setLogoutError(
        'Не вдалося коректно завершити сесію. Оновіть сторінку та спробуйте ще раз.',
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

  const displayName = getDisplayName(tokenParsed)
  const firstName = getFirstName(tokenParsed)
  const lastName = getLastName(tokenParsed)
  const username = getUsername(tokenParsed)

  return (
    <div className="profile-page">
      <PageHeading
        eyebrow="Особистий кабінет"
        title="Мій профіль"
        lead="Дані облікового запису, роль і статус доступу до реабілітаційної платформи."
      >
        <button
          type="button"
          className="button button--ghost button--sm"
          onClick={refreshUser}
          disabled={userLoading || isRequestingRole}
        >
          {userLoading ? (
            <span className="spinner spinner--sm" aria-hidden="true" />
          ) : (
            <RefreshIcon aria-hidden="true" />
          )}
          Оновити дані
        </button>
      </PageHeading>

      {userLoading && <Loading fullPage label="Завантажуємо профіль…" />}

      {!userLoading && error && (
        <div className="profile-error">
          <ErrorMessage
            title={isSessionError(error) ? 'Сесія завершилася' : 'Не вдалося отримати профіль'}
            message={error.message}
            code={error.status > 0 ? error.status : undefined}
            onRetry={refreshUser}
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

      {!userLoading && !error && profile && (
        <div className="profile-layout">
          <ProfileSidebar
            profile={profile}
            displayName={displayName}
            username={username}
            isLoggingOut={isLoggingOut}
            logoutError={logoutError}
            onLogout={handleLogout}
          />
          <div className="profile-main">
            <ProfileDetails
              profile={profile}
              firstName={firstName}
              lastName={lastName}
              username={username}
            />
            <ProfileRoleRequest
              profile={profile}
              isRequestingRole={isRequestingRole}
              roleRequestError={roleRequestError}
              roleRequestSuccess={roleRequestSuccess}
              onRequest={handleRoleRequest}
            />
            <ProfileDataAccess role={profile.role} />
          </div>
        </div>
      )}
    </div>
  )
}
