import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getDisplayName, getInitials } from '../lib/profile'
import { LogoMark } from './Icons'

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'site-nav__link site-nav__link--active' : 'site-nav__link'
}

export function Header() {
  const { initialized, authenticated, tokenParsed, initError } = useAuth()
  const displayName = getDisplayName(tokenParsed)
  const initials = getInitials(displayName)
  const realmRoles = tokenParsed?.realm_access?.roles
  const istherapist =
    Array.isArray(realmRoles) &&
    (realmRoles.includes('therapist') || realmRoles.includes('admin'))

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="brand" aria-label="AIRehab — на головну">
          <span className="brand__mark" aria-hidden="true">
            <LogoMark />
          </span>
          <span className="brand__text">
            <span className="brand__name">AIRehab</span>
            <span className="brand__tagline">реабілітація з AI</span>
          </span>
        </Link>

        <nav className="site-nav" aria-label="Головна навігація">
          <NavLink to="/" end className={navLinkClass}>
            Головна
          </NavLink>
          {authenticated && (
            <>
              <NavLink to="/patient" end className={navLinkClass}>
                Кабінет
              </NavLink>
              <NavLink to="/profile" className={navLinkClass}>
                Мій профіль
              </NavLink>
              <NavLink to="/patient/doctors" className={navLinkClass}>
                Лікарі
              </NavLink>
              <NavLink to="/patient/invitations" className={navLinkClass}>
                Запрошення
              </NavLink>
              <NavLink to="/patient/exercises" className={navLinkClass}>
                Мій цикл вправ
              </NavLink>
            </>
          )}
          {authenticated && istherapist && (
            <NavLink to="/therapist/patients" className={navLinkClass}>
              Пацієнти
            </NavLink>
          )}
          {authenticated && istherapist && (
            <NavLink to="/therapist/exercises" className={navLinkClass}>
              Вправи
            </NavLink>
          )}
        </nav>

        <div className="site-header__actions">
          {!initialized ? (
            <span className="header-status" aria-live="polite">
              <span className="spinner spinner--sm" aria-hidden="true" />
              Перевіряємо сесію
            </span>
          ) : authenticated ? (
            <Link to="/profile" className="user-chip" aria-label="Відкрити профіль">
              <span className="avatar avatar--sm" aria-hidden="true">
                {initials}
              </span>
              <span className="user-chip__name">{displayName}</span>
            </Link>
          ) : initError ? (
            <Link to="/error" className="button button--ghost button--sm">
              Проблема з входом
            </Link>
          ) : (
            <>
              <Link to="/login" className="button button--ghost button--sm">
                Увійти
              </Link>
              <Link to="/register" className="button button--primary button--sm">
                Зареєструватися
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
