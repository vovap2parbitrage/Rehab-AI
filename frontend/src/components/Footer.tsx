import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ShieldCheckIcon } from './Icons'

const currentYear = new Date().getFullYear()

export function Footer() {
  const { initialized, authenticated } = useAuth()

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p className="site-footer__copy">
          © {currentYear} AIRehab. Реабілітація під наглядом фахівців.
        </p>

        <p className="site-footer__security">
          <ShieldCheckIcon aria-hidden="true" />
          Захищений вхід через Keycloak
        </p>

        <nav className="site-footer__nav" aria-label="Додаткова навігація">
          {!initialized ? null : authenticated ? (
            <Link to="/profile">Мій профіль</Link>
          ) : (
            <>
              <Link to="/login">Вхід</Link>
              <Link to="/register">Реєстрація</Link>
            </>
          )}
        </nav>
      </div>
    </footer>
  )
}
