import { useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { ErrorMessage } from '../../components/ErrorMessage'
import { RefreshIcon } from '../../components/Icons'
import { PageHeading } from '../../components/PageHeading'
import { getDisplayName } from '../../lib/profile'
import { ChangePasswordForm } from './ChangePasswordForm'
import { ProfileDataAccess, ProfileDetails } from './ProfileDetails'
import { ProfileSidebar } from './ProfileSidebar'

export function ProfilePage() {
  const { logout, user: profile, userLoading, userError: error, refreshUser } = useAuth()

  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    setLogoutError(null)

    try {
      await logout()
    } catch (caught) {
      console.error('Logout failed', caught)
      setLogoutError('Не вдалося коректно завершити сесію. Оновіть сторінку та спробуйте ще раз.')
      setIsLoggingOut(false)
    }
  }

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
          disabled={userLoading}
        >
          {userLoading ? (
            <span className="spinner spinner--sm" aria-hidden="true" />
          ) : (
            <RefreshIcon aria-hidden="true" />
          )}
          Оновити дані
        </button>
      </PageHeading>

      {error && (
        <div className="profile-error">
          <ErrorMessage
            title="Не вдалося оновити профіль"
            message={error.message}
            code={error.status > 0 ? error.status : undefined}
            onRetry={refreshUser}
          />
        </div>
      )}

      {profile && (
        <div className="profile-layout">
          <ProfileSidebar
            profile={profile}
            displayName={getDisplayName(profile)}
            isLoggingOut={isLoggingOut}
            logoutError={logoutError}
            onLogout={handleLogout}
          />
          <div className="profile-main">
            <ProfileDetails profile={profile} />
            <ChangePasswordForm />
            <ProfileDataAccess role={profile.role} />
          </div>
        </div>
      )}
    </div>
  )
}
