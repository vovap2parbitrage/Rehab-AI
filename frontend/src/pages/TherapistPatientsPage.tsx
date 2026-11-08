import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client'
import { listPatients, sendInvitation, type Patient } from '../api/therapist'
import { MailIcon, UserIcon } from '../components/Icons'
import { ErrorMessage } from '../components/ErrorMessage'

export function TherapistPatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [invite, setInvite] = useState({ email: '' })

  useEffect(() => {
    listPatients().then(setPatients).catch((reason: unknown) => {
      setError(reason instanceof ApiError ? reason.detail || reason.message : 'Не вдалося завантажити пацієнтів.')
    })
  }, [])

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      await sendInvitation(invite.email)
      setInvite({ email: '' })
      setNotice('Запрошення пацієнту надіслано.')
    } catch (reason: unknown) {
      setError(reason instanceof ApiError ? reason.detail || reason.message : 'Не вдалося надіслати запрошення.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="workspace-page">
      <header className="page-heading workspace-heading">
        <div>
          <p className="eyebrow">Кабінет лікаря</p>
          <h1>Мої пацієнти</h1>
          <p className="page-heading__lead">Переглядайте пацієнтів і відкривайте їхні плани реабілітації.</p>
        </div>
      </header>

      {notice && <div className="success-message" role="status">{notice}</div>}
      {error && <ErrorMessage title="Не вдалося завантажити дані" message={error} />}

      <div className="workspace-summary-grid therapist-page__grid">
        <section className="card">
          <div className="card__header">
            <div><h2>Пацієнти ({patients.length})</h2><p>Натисніть на пацієнта, щоб призначити план.</p></div>
            <span className="card__header-icon"><UserIcon /></span>
          </div>
          <div className="patient-cards">
            {patients.map((patient) => (
              <Link className="patient-card" to={`/therapist/patients/${patient.id}`} key={patient.id}>
                <span className="avatar avatar--md" aria-hidden="true">
                  {patient.first_name.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <strong>{patient.first_name} {patient.last_name}</strong>
                  <small>{patient.user_id}</small>
                </span>
              </Link>
            ))}
            {patients.length === 0 && <p className="therapist-list__empty">Пацієнтів поки немає.</p>}
          </div>
        </section>

        <section className="card">
          <div className="card__header">
            <div><h2>Нове запрошення</h2><p>Додайте пацієнта до своєї практики.</p></div>
            <span className="card__header-icon"><MailIcon /></span>
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
