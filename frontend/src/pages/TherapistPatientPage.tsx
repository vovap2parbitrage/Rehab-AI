import { useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Assignment, Exercise, Patient } from '../api/therapist'
import { ErrorMessage } from '../components/ErrorMessage'
import { ArrowRightIcon, CalendarIcon } from '../components/Icons'
import { MOCK_ASSIGNMENT, MOCK_EXERCISE, MOCK_PATIENT } from '../data/therapistMocks'

const today = new Date().toISOString().slice(0, 10)
const monthFromToday = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

export function TherapistPatientPage() {
  const { patientId } = useParams()
  const [patient] = useState<Patient | null>(
    patientId === MOCK_PATIENT.id ? MOCK_PATIENT : null,
  )
  const [exercises] = useState<Exercise[]>([MOCK_EXERCISE])
  const [assignments, setAssignments] = useState<Assignment[]>(
    patientId === MOCK_PATIENT.id ? [MOCK_ASSIGNMENT] : [],
  )
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ exercise_id: MOCK_EXERCISE.id, approaches: 3, repetitions: 10, starts_on: today, ends_on: monthFromToday })

  const exerciseNames = useMemo(() => new Map(exercises.map((item) => [item.id, item.name])), [exercises])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!patientId) return
    setBusy(true)
    setNotice(null)
    try {
      const assignment: Assignment = {
        ...form,
        id: `mock-assignment-${Date.now()}`,
        patient_id: patientId,
        is_active: true,
      }
      setAssignments((current) => [assignment, ...current])
      setNotice('План призначено пацієнту.')
    } finally {
      setBusy(false)
    }
  }

  if (!patient) return <ErrorMessage title="Пацієнта не знайдено" message="Поверніться до списку пацієнтів." />

  return (
    <div className="therapist-page">
      <Link to="/therapist/patients" className="back-link"><ArrowRightIcon /> До всіх пацієнтів</Link>
      <header className="page-heading">
        <div><p className="eyebrow">Профіль пацієнта</p><h1>{patient.full_name}</h1><p className="page-heading__lead">{patient.note || 'Персональний план реабілітації та активні призначення.'}</p></div>
      </header>
      {notice && <div className="success-message" role="status">{notice}</div>}
      <div className="therapist-page__grid">
        <section className="card">
          <div className="card__header"><div><h2>Призначити план</h2><p>Оберіть вправу та параметри занять.</p></div><span className="card__header-icon"><CalendarIcon /></span></div>
          <form className="therapist-form" onSubmit={handleSubmit}>
            <label className="therapist-form__field"><span>Вправа *</span><select value={form.exercise_id} onChange={(event) => setForm({ ...form, exercise_id: event.target.value })} required><option value="">Оберіть вправу</option>{exercises.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <label className="therapist-form__field"><span>Підходи *</span><input type="number" min={1} max={14} value={form.approaches} onChange={(event) => setForm({ ...form, approaches: Number(event.target.value) })} required /></label>
            <label className="therapist-form__field"><span>Повторень *</span><input type="number" min={1} max={500} value={form.repetitions} onChange={(event) => setForm({ ...form, repetitions: Number(event.target.value) })} required /></label>
            <label className="therapist-form__field"><span>Початок *</span><input type="date" value={form.starts_on} onChange={(event) => setForm({ ...form, starts_on: event.target.value })} required /></label>
            <label className="therapist-form__field"><span>Завершення *</span><input type="date" value={form.ends_on} onChange={(event) => setForm({ ...form, ends_on: event.target.value })} required /></label>
            <button className="button button--primary" disabled={busy || exercises.length === 0}>{busy ? 'Призначаємо…' : 'Призначити план'}</button>
          </form>
        </section>
        <section className="card">
          <div className="card__header"><div><h2>Поточні призначення</h2><p>{assignments.length} активних планів</p></div></div>
          <div className="patient-assignments">{assignments.map((item) => <div className="therapist-assignment" key={item.id}><strong>{exerciseNames.get(item.exercise_id) || 'Вправа'}</strong><span>{item.approaches} підходи · {item.repetitions} повторень</span><small>{item.starts_on} — {item.ends_on}</small></div>)}{assignments.length === 0 && <p className="therapist-list__empty">Призначень поки немає.</p>}</div>
        </section>
      </div>
    </div>
  )
}
