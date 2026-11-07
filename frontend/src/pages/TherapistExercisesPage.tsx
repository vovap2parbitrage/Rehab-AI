import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client'
import { createExercise, deleteExercise, listExercises, updateExercise, type Exercise } from '../api/therapist'
import { ErrorMessage } from '../components/ErrorMessage'
import { ArrowRightIcon, CheckIcon, PencilIcon, TrashIcon } from '../components/Icons'

export function TherapistExercisesPage() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [form, setForm] = useState({ name: '', description: '', video: '' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    listExercises().then(setExercises).catch((reason: unknown) => {
      setError(reason instanceof ApiError ? reason.detail || reason.message : 'Не вдалося завантажити вправи.')
    })
  }, [])

  const startEditing = (exercise: Exercise) => {
    setEditingId(exercise.id)
    setForm({
      name: exercise.name,
      description: exercise.description || '',
      video: exercise.reference_video_key || '',
    })
    setNotice(null)
    setError(null)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setForm({ name: '', description: '', video: '' })
  }

  const handleDelete = async (exercise: Exercise) => {
    if (!window.confirm(`Видалити вправу «${exercise.name}»?`)) return
    setBusy(true)
    setError(null)
    try {
      await deleteExercise(exercise.id)
      setExercises((current) => current.filter((item) => item.id !== exercise.id))
      if (editingId === exercise.id) cancelEditing()
      setNotice('Вправу видалено.')
    } catch (reason: unknown) {
      setError(reason instanceof ApiError ? reason.detail || reason.message : 'Не вдалося видалити вправу.')
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      if (editingId) {
        const updated = await updateExercise(editingId, {
          name: form.name,
          description: form.description || null,
          reference_video_key: form.video || null,
          joint_tolerances: {},
        })
        setExercises((current) => current.map((item) => item.id === updated.id ? updated : item))
        cancelEditing()
        setNotice('Вправу змінено.')
      } else {
        const created = await createExercise({
          name: form.name,
          description: form.description || null,
          reference_video_key: form.video || null,
          joint_tolerances: {},
        })
        setExercises((current) => [...current, created])
        setForm({ name: '', description: '', video: '' })
        setNotice('Вправу додано до бібліотеки.')
      }
    } catch (reason: unknown) {
      setError(reason instanceof ApiError ? reason.detail || reason.message : 'Не вдалося створити вправу.')
    } finally {
      setBusy(false)
    }

  }

  return (
    <div className="workspace-page">
      <Link to="/therapist/patients" className="back-link"><ArrowRightIcon /> До пацієнтів</Link>
      <header className="page-heading workspace-heading"><div><p className="eyebrow">Кабінет лікаря</p><h1>Бібліотека вправ</h1><p className="page-heading__lead">Створюйте та переглядайте вправи для планів пацієнтів.</p></div></header>
      {notice && <div className="success-message" role="status">{notice}</div>}
      {error && <ErrorMessage title="Помилка" message={error} />}
      <div className="workspace-summary-grid therapist-page__grid">
        <section className="card"><div className="card__header"><div><h2>{editingId ? 'Редагування вправи' : 'Нова вправа'}</h2><p>{editingId ? 'Змініть назву або опис вправи.' : 'Відео поки зберігається як UI-заглушка.'}</p></div><span className="card__header-icon"><CheckIcon /></span></div>
          <form className="therapist-form" onSubmit={handleSubmit}>
            <label className="therapist-form__field"><span>Назва *</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={2} /></label>
            <label className="therapist-form__field"><span>Опис</span><textarea rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            {!editingId && <label className="therapist-form__field"><span>Відео *</span><input type="file" accept="video/*" onChange={(event) => setForm({ ...form, video: event.target.files?.[0]?.name || '' })} required /></label>}
            <button className="button button--primary" disabled={busy}>{busy ? 'Зберігаємо…' : editingId ? 'Зберегти зміни' : 'Створити вправу'}</button>
            {editingId && <button type="button" className="button button--ghost" onClick={cancelEditing}>Скасувати</button>}
          </form>
        </section>
        <section className="card"><div className="card__header"><div><h2>Мої вправи ({exercises.length})</h2><p>Вправи доступні для призначення пацієнтам.</p></div></div>
          <div className="exercise-library">
            {exercises.map((item) => (
              <article className="exercise-card" key={item.id}>
                <div>
                  <h3>{item.name}</h3>
                  <p>{item.description || 'Опис не додано.'}</p>
                  {item.reference_video_key && <small>Відео: {item.reference_video_key}</small>}
                </div>
                <div className="exercise-card__actions">
                  <button type="button" className="icon-button" aria-label={`Змінити ${item.name}`} title="Змінити" onClick={() => startEditing(item)} disabled={busy}><PencilIcon /></button>
                  <button type="button" className="icon-button icon-button--danger" aria-label={`Видалити ${item.name}`} title="Видалити" onClick={() => void handleDelete(item)} disabled={busy}><TrashIcon /></button>
                </div>
              </article>
            ))}
            {exercises.length === 0 && <p className="therapist-list__empty">Вправ поки немає.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}
