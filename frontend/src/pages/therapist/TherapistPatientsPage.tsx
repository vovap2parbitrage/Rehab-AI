import { EmptyState } from '../../components/EmptyState'
import { Loading } from '../../components/Loading'
import { PageHeading } from '../../components/PageHeading'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { getErrorMessage } from '../../lib/errorMessage'
import {
  listArchivedPatients,
  listPatients,
  restorePatient,
  sendInvitation,
  type Patient,
} from '../../api/therapist'
import { MailIcon, UserIcon } from '../../components/Icons'
import { ErrorMessage } from '../../components/ErrorMessage'
import { ListPagination, ListSearch } from '../../components/ListControls'
import { useRefreshOnEntry } from '../../lib/useCachedResource'
import type { TherapistWorkspaceResources } from './TherapistWorkspaceLayout'

const PAGE_SIZE = 20

export function TherapistPatientsPage() {
  const { plan } = useOutletContext<TherapistWorkspaceResources>()
  const { role } = useAuth()
  useRefreshOnEntry(plan, role === 'therapist')
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0)
  const archivedOffset = Math.max(0, Number(searchParams.get('archivedOffset')) || 0)
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientTotal, setPatientTotal] = useState(0)
  const [archivedPatients, setArchivedPatients] = useState<Patient[]>([])
  const [archivedTotal, setArchivedTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [archiveLoading, setArchiveLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [archiveLoadError, setArchiveLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [invite, setInvite] = useState({ email: '' })

  const loadLists = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setArchiveLoading(true)
      setLoadError(null)
      setArchiveLoadError(null)
      const [activeResult, archivedResult] = await Promise.allSettled([
        listPatients({ q, limit: PAGE_SIZE, offset, signal }),
        listArchivedPatients({ q, limit: PAGE_SIZE, offset: archivedOffset, signal }),
      ])
      if (signal?.aborted) return
      if (activeResult.status === 'fulfilled') {
        setPatients(activeResult.value.items)
        setPatientTotal(activeResult.value.total)
      } else {
        setLoadError(getErrorMessage(activeResult.reason, 'Не вдалося завантажити пацієнтів.'))
      }
      if (archivedResult.status === 'fulfilled') {
        setArchivedPatients(archivedResult.value.items)
        setArchivedTotal(archivedResult.value.total)
      } else {
        setArchiveLoadError(
          getErrorMessage(archivedResult.reason, 'Не вдалося завантажити архів пацієнтів.'),
        )
      }
      setLoading(false)
      setArchiveLoading(false)
    },
    [q, offset, archivedOffset],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadLists(controller.signal)
    return () => controller.abort()
  }, [loadLists])

  const updateQuery = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    setSearchParams(next)
  }

  const handleRestore = async (patient: Patient) => {
    setBusy(true)
    setNotice(null)
    setError(null)
    try {
      await restorePatient(patient.id)
      void loadLists()
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
              <h2>Пацієнти ({patientTotal})</h2>
              <p>Натисніть на пацієнта, щоб призначити план.</p>
            </div>
            <span className="card__header-icon">
              <UserIcon />
            </span>
          </div>
          <ListSearch
            label="Пошук пацієнтів"
            value={q}
            placeholder="Ім’я, прізвище або email"
            onChange={(value) => updateQuery({ q: value, offset: '0', archivedOffset: '0' })}
          />
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
                </span>
              </Link>
            ))}
            {loading && <Loading label="Завантажуємо пацієнтів…" />}
            {loadError && <ErrorMessage message={loadError} />}
            {!loading && !loadError && patients.length === 0 && (
              <EmptyState
                message={q ? 'Пацієнтів за цим пошуком не знайдено.' : 'Пацієнтів поки немає.'}
              />
            )}
          </div>
          <ListPagination
            total={patientTotal}
            limit={PAGE_SIZE}
            offset={offset}
            onChange={(nextOffset) => updateQuery({ offset: String(nextOffset) })}
          />
          {archiveLoadError && <ErrorMessage message={archiveLoadError} />}
          {(archivedTotal > 0 || archiveLoading) && (
            <div className="patient-cards patient-cards--archived">
              <h3>Архів ({archivedTotal})</h3>
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
              {archiveLoading && <Loading label="Завантажуємо архів…" />}
              <ListPagination
                total={archivedTotal}
                limit={PAGE_SIZE}
                offset={archivedOffset}
                onChange={(nextOffset) => updateQuery({ archivedOffset: String(nextOffset) })}
              />
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
