import type { UserProfile } from '../../api/auth'
import { ArrowRightIcon, CheckIcon, ClockIcon, HeartPulseIcon } from '../../components/Icons'
import { getRoleLabel } from '../../lib/profile'

interface ProfileRoleRequestProps {
  profile: UserProfile
  isRequestingRole: boolean
  roleRequestError: string | null
  roleRequestSuccess: string | null
  onRequest: () => void
}

export function ProfileRoleRequest({
  profile,
  isRequestingRole,
  roleRequestError,
  roleRequestSuccess,
  onRequest,
}: ProfileRoleRequestProps) {
  const canRequestTherapistRole =
    profile.role === 'patient' && profile.pending_role === null && profile.is_active

  return (
    <>
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
              Запит очікує підтвердження адміністратора. Після зміни ролі повторно увійдіть або
              оновіть профіль, щоб отримати актуальний доступ.
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
              onClick={onRequest}
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
              Роль не змінюється автоматично: її підтверджує адміністратор.
            </p>
          </div>
        </section>
      )}
    </>
  )
}
