import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { fetchCurrentUser, type AppRole } from '../api/auth'
import { useAuth } from '../auth/useAuth'
import { getDisplayName, getInitials } from '../lib/profile'
import { LogoMark } from './Icons'

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'site-nav__link site-nav__link--active' : 'site-nav__link'
}

export function Header() {
  const { initialized, authenticated, tokenParsed, initError } = useAuth()
  const [role, setRole] = useState<AppRole | null>(null)
  const displayName = getDisplayName(tokenParsed)
  const initials = getInitials(displayName)
  const isTherapist = role === 'therapist' || role === 'admin'
  const isPatient = role === 'patient'

  useEffect(() => {
    if (!authenticated) {
      setRole(null)
      return
    }

    const controller = new AbortController()
    fetchCurrentUser({ signal: controller.signal })
      .then((user) => {
        if (!controller.signal.aborted) setRole(user.role)
      })
      .catch(() => {
        if (!controller.signal.aborted) setRole(null)
      })

    return () => controller.abort()
  }, [authenticated])

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
          {authenticated && isPatient && (
            <>
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
          {authenticated && isTherapist && (
            <NavLink to="/therapist/patients" className={navLinkClass}>
              Пацієнти
            </NavLink>
          )}
          {authenticated && isTherapist && (
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
