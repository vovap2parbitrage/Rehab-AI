import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import {
  archivePatient,
  cancelAssignment,
  createAssignment,
  getPatient,
  listAssignments,
  listExercises,
  restorePatient,
  updateAssignment,
  type Assignment,
  type Exercise,
  type Patient,
} from '../../api/therapist'
import { EmptyState } from '../../components/EmptyState'
import { ErrorMessage } from '../../components/ErrorMessage'
import { ArrowRightIcon, CalendarIcon, PencilIcon, TrashIcon } from '../../components/Icons'
import { Loading } from '../../components/Loading'
import { PatientHistorySection } from '../../components/history/PatientHistorySection'
import { PageHeading } from '../../components/PageHeading'
import { PatientQuestionsCard } from '../../components/PatientQuestionsCard'
import { PatientSessionsCard } from '../../components/PatientSessionsCard'
import { formatWeekdays, nextSessionDate, WEEKDAYS, weekdayOf } from '../../lib/assignmentSchedule'
import { getErrorMessage } from '../../lib/errorMessage'
import { useLocalToday } from '../../lib/useLocalToday'
import type { TherapistWorkspaceResources } from './TherapistWorkspaceLayout'

export function TherapistPatientPage() {
  const { patientId } = useParams()
  const today = useLocalToday()
  const workspace = useOutletContext<TherapistWorkspaceResources | undefined>()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [startDate, setStartDate] = useState<string | null>(null)
  // The assignment being edited; null means the form creates a new assignment.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    exercise_id: '',
    duration_weeks: 4,
    weekdays: [0, 2, 4],
    repetitions: 10,
  })

  useEffect(() => {
    if (!patientId) return
    const controller = new AbortController()
    const options = { signal: controller.signal }
    setLoading(true)
    setNotFound(false)
    Promise.all([
      getPatient(patientId, options),
      listExercises(options),
      listAssignments(patientId, options),
    ])
      .then(([loadedPatient, loadedExercises, loadedAssignments]) => {
        if (options.signal.aborted) return
        setError(null)
        setPatient(loadedPatient)
        setExercises(loadedExercises)
        setAssignments(loadedAssignments)
        setForm((current) => ({ ...current, exercise_id: loadedExercises[0]?.id || '' }))
      })
      .catch((reason: unknown) => {
        if (options.signal.aborted) return
        if (reason instanceof ApiError && reason.status === 404) {
          setNotFound(true)
          return
        }
        setError(getErrorMessage(reason, 'Не вдалося завантажити дані пацієнта.'))
      })
      .finally(() => {
        if (!options.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [patientId])

  const exerciseNames = useMemo(
    () => new Map(exercises.map((item) => [item.id, item.name])),
    [exercises],
  )

  // Until the doctor picks a date, the plan starts on the first day of the schedule.
  const start = startDate ?? nextSessionDate(today, form.weekdays)
  // "Today" here is the browser's date; the server checks it in the doctor's time zone.
  const startError = editingId
    ? null
    : start < today
      ? 'Дата початку не може бути раніше за сьогодні.'
      : form.weekdays.length > 0 && !form.weekdays.includes(weekdayOf(start))
        ? `Перше заняття має припадати на один із обраних днів: ${formatWeekdays(form.weekdays)}.`
        : null

  const resetForm = () => {
    setEditingId(null)
    setStartDate(null)
    setForm({
      exercise_id: exercises[0]?.id || '',
      duration_weeks: 4,
      weekdays: [0, 2, 4],
      repetitions: 10,
    })
  }

  const startEditing = (assignment: Assignment) => {
    setEditingId(assignment.id)
    setStartDate(assignment.starts_on)
    setForm({
      exercise_id: assignment.exercise_id,
      duration_weeks: assignment.duration_weeks,
      weekdays: assignment.weekdays,
      repetitions: assignment.repetitions,
    })
    setNotice(null)
    setError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!patientId) return
    setBusy(true)
    setNotice(null)
    setError(null)
    try {
      if (editingId) {
        const updated = await updateAssignment(editingId, {
          duration_weeks: form.duration_weeks,
          weekdays: form.weekdays,
          repetitions: form.repetitions,
        })
        setAssignments((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        )
        resetForm()
        setNotice('Призначення змінено.')
      } else {
        const assignment = await createAssignment({
          ...form,
          patient_id: patientId,
          starts_on: start,
        })
        setAssignments((current) => [assignment, ...current])
        setNotice('План призначено пацієнту.')
      }
    } catch (reason: unknown) {
      setError(
        getErrorMessage(
          reason,
          editingId ? 'Не вдалося змінити призначення.' : 'Не вдалося створити призначення.',
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const handleCancel = async (assignment: Assignment) => {
    if (!window.confirm(`Відмінити призначення «${exerciseNames.get(assignment.exercise_id)}»?`))
      return
    setBusy(true)
    setError(null)
    try {
      await cancelAssignment(assignment.id)
      if (editingId === assignment.id) resetForm()
      setAssignments((current) =>
        current.map((item) =>
          item.id === assignment.id ? { ...item, status: 'cancelled' } : item,
        ),
      )
      setNotice('Призначення відмінено.')
    } catch (reason: unknown) {
      setError(getErrorMessage(reason, 'Не вдалося скасувати призначення.'))
    } finally {
      setBusy(false)
    }
  }

  const handleArchive = async () => {
    if (!patient) return
    if (
      !window.confirm(
        'Архівувати пацієнта? Усі ваші активні призначення для нього буде скасовано. Історію можна буде переглядати, а пацієнта — відновити.',
      )
    )
      return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await archivePatient(patient.id)
      setPatient({ ...patient, archived_at: new Date().toISOString() })
      setAssignments((current) =>
        current.map((item) => (item.status === 'active' ? { ...item, status: 'cancelled' } : item)),
      )
      workspace?.patients.invalidate()
      workspace?.archivedPatients.invalidate()
      workspace?.plan.invalidate()
      setNotice('Пацієнта архівовано. Активні призначення скасовано.')
    } catch (reason: unknown) {
      setError(getErrorMessage(reason, 'Не вдалося архівувати пацієнта.'))
    } finally {
      setBusy(false)
    }
  }

  const handleRestore = async () => {
    if (!patient) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await restorePatient(patient.id)
      setPatient({ ...patient, archived_at: null })
      workspace?.patients.invalidate()
      workspace?.archivedPatients.invalidate()
      workspace?.plan.invalidate()
      setNotice('Пацієнта повернено до активного списку.')
    } catch (reason: unknown) {
      setError(getErrorMessage(reason, 'Не вдалося відновити пацієнта.'))
    } finally {
      setBusy(false)
    }
  }

  const backLink = (
    <Link to="/therapist/patients" className="back-link">
      <ArrowRightIcon aria-hidden="true" /> До всіх пацієнтів
    </Link>
  )

  if (loading || notFound || patient?.id !== patientId || !patient) {
    return (
      <div className="workspace-page">
        {backLink}
        <PageHeading title="Профіль пацієнта" />
        {loading ? (
          <Loading label="Завантажуємо дані пацієнта…" />
        ) : error && !notFound ? (
          <ErrorMessage message={error} />
        ) : (
          <ErrorMessage title="Пацієнта не знайдено" message="Поверніться до списку пацієнтів." />
        )}
      </div>
    )
  }

  return (
    <div className="workspace-page">
      {backLink}
      <PageHeading
        eyebrow="Профіль пацієнта"
        title={[patient.first_name, patient.last_name].filter(Boolean).join(' ') || 'Пацієнт'}
        lead={patient.notes || 'Персональний план реабілітації та активні призначення.'}
      >
        {patient.archived_at ? (
          <button
            type="button"
            className="button button--ghost"
            onClick={() => void handleRestore()}
            disabled={busy}
          >
            Відновити пацієнта
          </button>
        ) : (
          <button
            type="button"
            className="button button--danger-ghost"
            onClick={() => void handleArchive()}
            disabled={busy}
          >
            Архівувати пацієнта
          </button>
        )}
      </PageHeading>
      {notice && (
        <div className="success-message" role="status">
          {notice}
        </div>
      )}
      {error && <ErrorMessage title="Помилка" message={error} />}
      <div className="workspace-summary-grid therapist-page__grid">
        <section className="card">
          <div className="card__header">
            <div>
              <h2>{editingId ? 'Змінити призначення' : 'Призначити план'}</h2>
              <p>
                {editingId
                  ? 'Змініть параметри занять. Вправу змінити не можна.'
                  : 'Оберіть вправу та параметри занять.'}
              </p>
            </div>
            <span className="card__header-icon">
              <CalendarIcon />
            </span>
          </div>
          {patient.archived_at ? (
            <EmptyState message="Пацієнт в архіві. Відновіть його, щоб призначати нові плани." />
          ) : (
            <form className="therapist-form" onSubmit={handleSubmit}>
              <label className="therapist-form__field">
                <span>Вправа *</span>
                <select
                  value={form.exercise_id}
                  onChange={(event) => setForm({ ...form, exercise_id: event.target.value })}
                  disabled={editingId !== null}
                  required
                >
                  <option value="">Оберіть вправу</option>
                  {exercises.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="therapist-form__field">
                <span>Тривалість (тижні) *</span>
                <input
                  type="number"
                  min={1}
                  value={form.duration_weeks}
                  onChange={(event) =>
                    setForm({ ...form, duration_weeks: Number(event.target.value) })
                  }
                  required
                />
              </label>
              <fieldset className="therapist-form__field">
                <legend>План занять *</legend>
                <div className="weekday-picker">
                  {WEEKDAYS.map((day, index) => (
                    <label key={day}>
                      <input
                        type="checkbox"
                        checked={form.weekdays.includes(index)}
                        onChange={() =>
                          setForm({
                            ...form,
                            weekdays: form.weekdays.includes(index)
                              ? form.weekdays.filter((item) => item !== index)
                              : [...form.weekdays, index].sort((a, b) => a - b),
                          })
                        }
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="therapist-form__field">
                <span>Повторень *</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={form.repetitions}
                  onChange={(event) =>
                    setForm({ ...form, repetitions: Number(event.target.value) })
                  }
                  required
                />
              </label>
              <label className="therapist-form__field">
                <span>Початок *</span>
                <input
                  type="date"
                  value={start}
                  min={today}
                  onChange={(event) => setStartDate(event.target.value)}
                  disabled={editingId !== null}
                  aria-invalid={startError !== null}
                  required
                />
                {startError && (
                  <small className="therapist-form__error" role="alert">
                    {startError}
                  </small>
                )}
                {editingId && <small>Дату початку змінити не можна.</small>}
              </label>
              <button
                type="submit"
                className="button button--primary"
                disabled={
                  busy ||
                  exercises.length === 0 ||
                  form.weekdays.length === 0 ||
                  startError !== null
                }
              >
                {busy ? 'Зберігаємо…' : editingId ? 'Зберегти зміни' : 'Призначити план'}
              </button>
              {editingId && (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={resetForm}
                  disabled={busy}
                >
                  Скасувати редагування
                </button>
              )}
            </form>
          )}
        </section>
        <div className="therapist-page__column">
          <section className="card">
            <div className="card__header">
              <div>
                <h2>Поточні призначення</h2>
                <p>{assignments.length} активних планів</p>
              </div>
            </div>
            <div className="patient-assignments">
              {assignments.map((item) => (
                <div className="therapist-assignment" key={item.id}>
                  <strong>{exerciseNames.get(item.exercise_id) || 'Вправа'}</strong>
                  <span>
                    {item.repetitions} повторень · {formatWeekdays(item.weekdays)}
                  </span>
                  <small>
                    {item.starts_on} · {item.duration_weeks} тиж.
                  </small>
                  <span>· стан: {item.status}</span>
                  {item.status === 'active' && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Змінити ${exerciseNames.get(item.exercise_id)}`}
                      title="Змінити"
                      onClick={() => startEditing(item)}
                      disabled={busy}
                    >
                      <PencilIcon />
                    </button>
                  )}
                  {item.status === 'active' && (
                    <button
                      type="button"
                      className="icon-button icon-button--danger"
                      aria-label={`Відмінити ${exerciseNames.get(item.exercise_id)}`}
                      title="Відмінити"
                      onClick={() => void handleCancel(item)}
                      disabled={busy}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              ))}
              {assignments.length === 0 && <EmptyState message="Призначень поки немає." />}
            </div>
          </section>
          <PatientQuestionsCard patientId={patient.id} />
        </div>
      </div>
      <PatientHistorySection
        patientId={patient.id}
        title="Історія виконання"
        description="Біль, регулярність занять та оцінка техніки пацієнта."
        emptyText="Пацієнт ще не завершив жодної сесії за цей період."
      />
      <PatientSessionsCard
        patientId={patient.id}
        exerciseNameFor={(assignmentId) => {
          const item = assignments.find((assignment) => assignment.id === assignmentId)
          return (item && exerciseNames.get(item.exercise_id)) || 'Вправа'
        }}
      />
    </div>
  )
}
