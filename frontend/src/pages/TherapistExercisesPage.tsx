import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { Exercise } from '../api/therapist'
import { ArrowRightIcon, CheckIcon } from '../components/Icons'
import { MOCK_EXERCISE } from '../data/therapistMocks'

export function TherapistExercisesPage() {
  const [exercises, setExercises] = useState<Exercise[]>([MOCK_EXERCISE])
  const [form, setForm] = useState({ name: '', description: '', video: '' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const created: Exercise = {
        id: `mock-exercise-${Date.now()}`,
        name: form.name,
        description: form.description || null,
        reference_video_key: form.video,
        joint_tolerances: {},
      }
      setExercises((current) => [...current, created])
      setForm({ name: '', description: '', video: '' })
      setNotice('Вправу додано до бібліотеки.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="therapist-page">
      <Link to="/therapist/patients" className="back-link"><ArrowRightIcon /> До пацієнтів</Link>
      <header className="page-heading"><div><p className="eyebrow">Кабінет лікаря</p><h1>Бібліотека вправ</h1><p className="page-heading__lead">Створюйте та переглядайте вправи для планів пацієнтів.</p></div></header>
      {notice && <div className="success-message" role="status">{notice}</div>}
      <div className="therapist-page__grid">
        <section className="card"><div className="card__header"><div><h2>Нова вправа</h2><p>Відео поки зберігається як UI-заглушка.</p></div><span className="card__header-icon"><CheckIcon /></span></div>
          <form className="therapist-form" onSubmit={handleSubmit}>
            <label className="therapist-form__field"><span>Назва *</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={2} /></label>
            <label className="therapist-form__field"><span>Опис</span><textarea rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <label className="therapist-form__field"><span>Відео *</span><input type="file" accept="video/*" onChange={(event) => setForm({ ...form, video: event.target.files?.[0]?.name || '' })} required={!form.video} /></label>
            <button className="button button--primary" disabled={busy}>{busy ? 'Зберігаємо…' : 'Створити вправу'}</button>
          </form>
        </section>
        <section className="card"><div className="card__header"><div><h2>Мої вправи ({exercises.length})</h2><p>Вправи доступні для призначення пацієнтам.</p></div></div>
          <div className="exercise-library">{exercises.map((item) => <article className="exercise-card" key={item.id}><h3>{item.name}</h3><p>{item.description || 'Опис не додано.'}</p>{item.reference_video_key && <small>Відео: {item.reference_video_key}</small>}</article>)}{exercises.length === 0 && <p className="therapist-list__empty">Вправ поки немає.</p>}</div>
        </section>
      </div>
    </div>
  )
}
