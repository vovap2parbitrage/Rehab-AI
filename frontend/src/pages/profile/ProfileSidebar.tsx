import type { UserProfile } from '../../api/auth'
import { LogoutIcon, ShieldCheckIcon } from '../../components/Icons'
import { RoleBadge } from '../../components/RoleBadge'
import { getInitials, getRoleDescription } from '../../lib/profile'

interface ProfileSidebarProps {
  profile: UserProfile
  displayName: string
  username: string
  isLoggingOut: boolean
  logoutError: string | null
  onLogout: () => void
}

export function ProfileSidebar({
  profile,
  displayName,
  username,
  isLoggingOut,
  logoutError,
  onLogout,
}: ProfileSidebarProps) {
  const initials = getInitials(displayName)

  return (
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
          Ви увійшли через захищений сервіс.
        </p>

        {logoutError && <p className="form-error">{logoutError}</p>}

        <button
          type="button"
          className="button button--danger-ghost button--block"
          onClick={onLogout}
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
  )
}
