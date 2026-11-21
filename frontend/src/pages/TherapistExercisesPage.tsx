import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { PageHeading } from '../components/PageHeading'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client'
import { createExercise, deleteExercise, listExercises, updateExercise, type Exercise } from '../api/therapist'
import { ErrorMessage } from '../components/ErrorMessage'
import { ReferenceVideo } from '../components/ReferenceVideo'
import { ArrowRightIcon, CheckIcon, PencilIcon, TrashIcon } from '../components/Icons'
import { deleteUploadedVideo, uploadVideo } from '../api/uploads'
import { BODY_PARTS } from '../lib/bodyParts'
import { getErrorMessage } from '../lib/errorMessage'
import { useVideoPreview } from '../lib/useVideoPreview'

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(video.duration)
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Не вдалося прочитати відео.'))
    }
    video.src = url
  })
}

export function TherapistExercisesPage() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [form, setForm] = useState({ name: '', description: ''})
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [bodyParts, setBodyParts] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const videoPreview = useVideoPreview()
  const editingExercise = exercises.find((item) => item.id === editingId)

  useEffect(() => {
    const controller = new AbortController()
    listExercises(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setExercises(items)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(getErrorMessage(reason, 'Не вдалося завантажити вправи.'))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  const startEditing = (exercise: Exercise) => {
    setEditingId(exercise.id)
    setForm({
      name: exercise.name,
      description: exercise.description || '',
    })
    setBodyParts(exercise.body_parts)
    setVideoFile(null)
    if (videoInputRef.current) videoInputRef.current.value = ''
    setNotice(null)
    setError(null)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setForm({ name: '', description: ''})
    setBodyParts([])
    setVideoFile(null)
    if (videoInputRef.current) videoInputRef.current.value = ''
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
      setError(getErrorMessage(reason, 'Не вдалося видалити вправу.'))
    } finally {
      setBusy(false)
    }
  }

  const toggleBodyPart = (part: string) => {
    if (bodyParts.includes(part)) {
      setBodyParts(bodyParts.filter((item) => item !== part))
    } else {
      setBodyParts([...bodyParts, part])
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault()
  setError(null)
  setNotice(null)
  if (bodyParts.length === 0) {
    setError('Оберіть хоча б одну частину тіла.')
    return
  }
  if (!videoFile && (!editingId || !editingExercise?.reference_video_key)) {
    const message = 'Оберіть відео.'
    setVideoError(message)
    setError(message)
    return
  }
  setBusy(true)
  setVideoError(null)
  let uploadedVideoKey: string | null = null

  try {
    if (videoFile) {
      const duration = await getVideoDuration(videoFile)
      if (duration > 120) {
        const message = 'Відео задовге. Максимальна тривалість — 120 секунд.'
        setVideoError(message)
        setError(message)
        return
      }
    }
    if (videoFile) uploadedVideoKey = await uploadVideo(videoFile)
    const videoKey = uploadedVideoKey ?? editingExercise?.reference_video_key ?? null
    if (editingId) {
      const updated = await updateExercise(editingId, {
        name: form.name,
        description: form.description || null,
        reference_video_key: videoKey,
        joint_tolerances: editingExercise?.joint_tolerances ?? {},
        body_parts: bodyParts,
      })
      setExercises((current) => current.map((item) => item.id === updated.id ? updated : item))
      if (videoFile) {
        // The old link points at the replaced video: drop it and load the new one.
        videoPreview.hide(updated.id)
        await videoPreview.show(updated.id)
      }
      cancelEditing()
      setNotice('Вправу змінено.')
    } else {
      const created = await createExercise({
        name: form.name,
        description: form.description || null,
        reference_video_key: videoKey,
        joint_tolerances: {},
        body_parts: bodyParts,
      })
      setExercises((current) => [...current, created])
      setForm({ name: '', description: ''})
      setVideoFile(null)
      if (videoInputRef.current) videoInputRef.current.value = ''
      setBodyParts([])
      setNotice('Вправу додано до бібліотеки.')
    }
  } catch (reason: unknown) {
    let message = getErrorMessage(reason, 'Не вдалося зберегти вправу.')
    if (uploadedVideoKey) {
      try {
        await deleteUploadedVideo(uploadedVideoKey)
      } catch (cleanupReason: unknown) {
        if (cleanupReason instanceof ApiError && cleanupReason.status === 409) {
          message += ' Нове відео вже прив’язане до вправи, тому його не видалено.'
        } else {
          const cleanupMessage = getErrorMessage(cleanupReason, 'невідома помилка')
          message += ` Не вдалося видалити нове відео: ${cleanupMessage}`
        }
      }
    }
    setError(message)
  } finally {
    setBusy(false)
  }
}

  return (
    <div className="workspace-page">
      <Link to="/therapist/patients" className="back-link"><ArrowRightIcon /> До пацієнтів</Link>
      <PageHeading
        eyebrow="Кабінет лікаря"
        title="Бібліотека вправ"
        lead="Створюйте та переглядайте вправи для планів пацієнтів."
      />
      {notice && <div className="success-message" role="status">{notice}</div>}
      {error && <ErrorMessage title="Помилка" message={error} />}
      {videoPreview.error && <ErrorMessage title="Не вдалося відкрити відео" message={videoPreview.error} />}
      <div className="workspace-summary-grid therapist-page__grid">
        <section className="card"><div className="card__header"><div><h2>{editingId ? 'Редагування вправи' : 'Нова вправа'}</h2><p>{editingId ? 'Змініть назву або опис вправи.' : 'Додайте назву, опис і відео вправи.'}</p></div><span className="card__header-icon"><CheckIcon /></span></div>
          <form className="therapist-form" onSubmit={handleSubmit}>
            <label className="therapist-form__field"><span>Назва *</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={2} /></label>
            <label className="therapist-form__field"><span>Опис</span><textarea rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <div className="therapist-form__field">
              <span>Частини тіла *</span>

              <div className="therapist-form__body-parts">
                {BODY_PARTS.map((part) => (
                  <label className="therapist-form__body-part" key={part.value}>
                    <input
                      type="checkbox"
                      checked={bodyParts.includes(part.value)}
                      onChange={() => toggleBodyPart(part.value)}
                    />
                    {part.label}
                  </label>
                ))}
              </div>
            </div>
            <label className="therapist-form__field"><span>Відео {(!editingId || !editingExercise?.reference_video_key) && '*'}</span><input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime" onChange={(event) => {
              setVideoFile(event.target.files?.[0] || null)
              setVideoError(null)
              setError(null)
            }} required={!editingId || !editingExercise?.reference_video_key} /></label>
            {videoError && <p className="error-message">{videoError}</p>}
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
                  {item.reference_video_key && (
                    <ReferenceVideo exerciseId={item.id} preview={  videoPreview} showLabel="Переглянути відео" />
                  )}
                </div>
                <div className="exercise-card__actions">
                  <button type="button" className="icon-button" aria-label={`Змінити ${item.name}`} title="Змінити" onClick={() => startEditing(item)} disabled={busy}><PencilIcon /></button>
                  <button type="button" className="icon-button icon-button--danger" aria-label={`Видалити ${item.name}`} title="Видалити" onClick={() => void handleDelete(item)} disabled={busy}><TrashIcon /></button>
                </div>
              </article>
            ))}
            {loading && <Loading label="Завантажуємо вправи…" />}
            {loadError && <ErrorMessage message={loadError} />}
            {!loading && !loadError && exercises.length === 0 && <EmptyState message="Вправ поки немає." />}
          </div>
        </section>
      </div>
    </div>
  )
}
