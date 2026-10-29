import type { ReactNode } from 'react'
import { CheckIcon, ShieldCheckIcon } from './Icons'

interface AuthLayoutProps {
  eyebrow: string
  title: string
  description: string
  icon: ReactNode
  asideTitle: string
  asideText: string
  asidePoints: string[]
  footer: ReactNode
  children: ReactNode
}

export function AuthLayout({
  eyebrow,
  title,
  description,
  icon,
  asideTitle,
  asideText,
  asidePoints,
  footer,
  children,
}: AuthLayoutProps) {
  return (
    <div className="auth-layout">
      <section className="auth-card" aria-labelledby="auth-title">
        <span className="auth-card__icon" aria-hidden="true">
          {icon}
        </span>

        <p className="eyebrow">{eyebrow}</p>
        <h1 id="auth-title">{title}</h1>
        <p className="auth-card__lead">{description}</p>

        <div className="auth-card__body">{children}</div>
        <div className="auth-card__footer">{footer}</div>
      </section>

      <aside className="auth-aside" aria-label="Переваги захищеного входу">
        <span className="auth-aside__badge">
          <ShieldCheckIcon aria-hidden="true" />
          Keycloak · OIDC + PKCE
        </span>

        <h2>{asideTitle}</h2>
        <p>{asideText}</p>

        <ul className="check-list">
          {asidePoints.map((point) => (
            <li key={point}>
              <CheckIcon aria-hidden="true" />
              <span>{point}</span>
            </li>
          ))}
        </ul>

        <p className="auth-aside__note">
          AIRehab не бачить і не зберігає ваш пароль. Автентифікацію виконує Keycloak, а
          вебзастосунок отримує лише підписаний токен доступу.
        </p>
      </aside>
    </div>
  )
}
