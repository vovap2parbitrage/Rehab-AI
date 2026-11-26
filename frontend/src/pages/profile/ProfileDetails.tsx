import type { ReactNode } from 'react'
import type { UserProfile } from '../../api/auth'
import { CalendarIcon, LockIcon, MailIcon, UserIcon } from '../../components/Icons'
import { RoleBadge } from '../../components/RoleBadge'
import { getFirstName, getLastName } from '../../lib/profile'

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

interface ProfileDetailsProps {
  profile: UserProfile
}

export function ProfileDetails({ profile }: ProfileDetailsProps) {
  return (
    <>
      <section className="card" aria-labelledby="personal-title">
        <div className="card__header">
          <div>
            <h2 id="personal-title">Особисті дані</h2>
          </div>
          <span className="card__header-icon" aria-hidden="true">
            <UserIcon />
          </span>
        </div>

        <dl className="details-grid">
          <Detail label="Ім’я">{valueOrFallback(getFirstName(profile))}</Detail>
          <Detail label="Прізвище">{valueOrFallback(getLastName(profile))}</Detail>
          <Detail label="Email" icon={<MailIcon />}>
            {profile.email}
          </Detail>
        </dl>
      </section>

      <section className="card" aria-labelledby="account-title">
        <div className="card__header">
          <div>
            <h2 id="account-title">Обліковий запис</h2>
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
          </dl>
        </details>
      </section>
    </>
  )
}

export function ProfileDataAccess({ role }: { role: UserProfile['role'] }) {
  return (
    <section className="card account-meta" aria-labelledby="meta-title">
      <span className="account-meta__icon" aria-hidden="true">
        <CalendarIcon />
      </span>
      <div>
        <h2 id="meta-title">Доступ до даних</h2>
        <p>
          {role === 'therapist'
            ? 'Ви бачите лише дані своїх пацієнтів і свої вправи.'
            : 'Ваші реабілітаційні дані доступні лише вам і лікарям, яких ви прийняли.'}
        </p>
      </div>
    </section>
  )
}
