import { EmptyState } from '../../components/EmptyState'
import { Loading } from '../../components/Loading'
import { PageHeading } from '../../components/PageHeading'
import { useState, type FormEvent } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { getErrorMessage } from '../../lib/errorMessage'
import { restorePatient, sendInvitation, type Patient } from '../../api/therapist'
import { MailIcon, UserIcon } from '../../components/Icons'
import { ErrorMessage } from '../../components/ErrorMessage'
import { useRefreshOnEntry } from '../../lib/useCachedResource'
import type { TherapistWorkspaceResources } from './TherapistWorkspaceLayout'

export function TherapistPatientsPage() {
  const {
    patients: resource,
    archivedPatients: archivedResource,
    plan,
  } = useOutletContext<TherapistWorkspaceResources>()
  const { role } = useAuth()
  useRefreshOnEntry(resource)
  useRefreshOnEntry(archivedResource)
  useRefreshOnEntry(plan, role === 'therapist')
  const { data: patients = [], loading, error: loadError } = resource
  const { data: archivedPatients = [], error: archiveLoadError } = archivedResource
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [invite, setInvite] = useState({ email: '' })

  const handleRestore = async (patient: Patient) => {
    setBusy(true)
    setNotice(null)
    setError(null)
    try {
      await restorePatient(patient.id)
      archivedResource.update((current) => current.filter((item) => item.id !== patient.id))
      resource.invalidate()
      plan.invalidate()
      setNotice('Пацієнта повернено до активного списку.')
    } catch (reason: unknown) {
      setError(getErrorMessage(reason, 'Не вдалося відновити пацієнта.'))
    } finally {
      setBusy(false)
    }
  }

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      await sendInvitation(invite.email)
      setInvite({ email: '' })
      plan.invalidate()
      setNotice('Запрошення пацієнту надіслано.')
    } catch (reason: unknown) {
      setError(getErrorMessage(reason, 'Не вдалося надіслати запрошення.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="workspace-page">
      <PageHeading
        eyebrow="Кабінет лікаря"
        title="Мої пацієнти"
        lead="Переглядайте пацієнтів і відкривайте їхні плани реабілітації."
      />

      {notice && (
        <div className="success-message" role="status">
          {notice}
        </div>
      )}
      {error && <ErrorMessage title="Не вдалося завантажити дані" message={error} />}

      {plan.data && (
        <section className="card plan-summary" aria-label="Ваш тариф">
          <div>
            <h2>Тариф «{plan.data.plan_name}»</h2>
            <p>
              Активних пацієнтів: {plan.data.active} з {plan.data.limit} · вільно {plan.data.free}
              {plan.data.pending > 0 &&
                ` · очікують відповіді запрошень: ${plan.data.pending} (займають місце)`}
            </p>
          </div>
          <Link to="/pricing" className="button button--ghost">
            Змінити тариф
          </Link>
        </section>
      )}

      <div className="workspace-summary-grid therapist-page__grid">
        <section className="card">
          <div className="card__header">
            <div>
              <h2>Пацієнти ({patients.length})</h2>
              <p>Натисніть на пацієнта, щоб призначити план.</p>
            </div>
            <span className="card__header-icon">
              <UserIcon />
            </span>
          </div>
          <div className="patient-cards">
            {patients.map((patient) => (
              <Link
                className="patient-card"
                to={`/therapist/patients/${patient.id}`}
                key={patient.id}
              >
                <span className="avatar avatar--md" aria-hidden="true">
                  {patient.first_name.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <strong>
                    {patient.first_name} {patient.last_name}
                  </strong>
                  <small>{patient.user_id}</small>
                </span>
              </Link>
            ))}
            {loading && <Loading label="Завантажуємо пацієнтів…" />}
            {loadError && <ErrorMessage message={loadError} />}
            {!loading && !loadError && patients.length === 0 && (
              <EmptyState message="Пацієнтів поки немає." />
            )}
          </div>
          {archiveLoadError && <ErrorMessage message={archiveLoadError} />}
          {archivedPatients.length > 0 && (
            <div className="patient-cards patient-cards--archived">
              <h3>Архів ({archivedPatients.length})</h3>
              {archivedPatients.map((patient) => (
                <div className="patient-card patient-card--archived" key={patient.id}>
                  <span className="avatar avatar--md" aria-hidden="true">
                    {patient.first_name.slice(0, 1).toUpperCase()}
                  </span>
                  <Link to={`/therapist/patients/${patient.id}`}>
                    <strong>
                      {patient.first_name} {patient.last_name}
                    </strong>
                    <small>Історія доступна для перегляду</small>
                  </Link>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => void handleRestore(patient)}
                    disabled={busy}
                    aria-label={`Відновити ${patient.first_name} ${patient.last_name}`}
                  >
                    Відновити
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card__header">
            <div>
              <h2>Нове запрошення</h2>
              <p>Додайте пацієнта до своєї практики.</p>
            </div>
            <span className="card__header-icon">
              <MailIcon />
            </span>
          </div>
          <form className="therapist-form" onSubmit={handleInvite}>
            <label className="therapist-form__field">
              <span>Email пацієнта *</span>
              <input
                type="email"
                value={invite.email}
                onChange={(event) => setInvite({ email: event.target.value })}
                required
              />
            </label>
            <button className="button button--primary" disabled={busy}>
              {busy ? 'Надсилаємо…' : 'Надіслати запрошення'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
