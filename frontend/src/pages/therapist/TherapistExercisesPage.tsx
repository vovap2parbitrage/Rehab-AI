import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import {
  createExercise,
  deleteExercise,
  listExercises,
  updateExercise,
  type Exercise,
} from '../../api/therapist'
import { ErrorMessage } from '../../components/ErrorMessage'
import { ArrowRightIcon } from '../../components/Icons'
import { PageHeading } from '../../components/PageHeading'
import { deleteUploadedVideo, uploadVideo } from '../../api/uploads'
import { getErrorMessage } from '../../lib/errorMessage'
import { useVideoPreview } from '../../lib/useVideoPreview'
import { ExerciseForm } from './ExerciseForm'
import { ExerciseLibrary } from './ExerciseLibrary'

const PAGE_SIZE = 20

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

/** What the doctor is told after saving: a new version, and where the assignments stand. */
function describeEdit(before: Exercise | undefined, after: Exercise, applied: boolean): string {
  if (!before || after.version === before.version) return 'Вправу змінено.'
  const active = before.active_assignments
  if (active === 0) return `Вправу змінено. Створено версію ${after.version}.`
  return applied
    ? `Вправу змінено. Версію ${after.version} застосовано до активних призначень (${active}).`
    : `Вправу змінено. Створено версію ${after.version}; активні призначення (${active}) лишились на попередній.`
}

export function TherapistExercisesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', description: '' })
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [bodyParts, setBodyParts] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [applyToActive, setApplyToActive] = useState(false)
  const videoPreview = useVideoPreview()
  const editingExercise = exercises.find((item) => item.id === editingId)
  const videoRequired = !editingId || !editingExercise?.reference_video_key

  const refreshExercises = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setLoadError(null)
      try {
        const page = await listExercises({ q, limit: PAGE_SIZE, offset, signal })
        if (signal?.aborted) return
        setExercises(page.items)
        setTotal(page.total)
      } catch (reason: unknown) {
        if (!signal?.aborted) {
          setLoadError(getErrorMessage(reason, 'Не вдалося завантажити вправи.'))
        }
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [q, offset],
  )

  useEffect(() => {
    const controller = new AbortController()
    void refreshExercises(controller.signal)
    return () => controller.abort()
  }, [refreshExercises])

  const updateQuery = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    setSearchParams(next)
  }

  const startEditing = (exercise: Exercise) => {
    setEditingId(exercise.id)
    setForm({
      name: exercise.name,
      description: exercise.description || '',
    })
    setBodyParts(exercise.body_parts)
    setApplyToActive(false)
    setVideoFile(null)
    if (videoInputRef.current) videoInputRef.current.value = ''
    setNotice(null)
    setError(null)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setApplyToActive(false)
    setForm({ name: '', description: '' })
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
      await refreshExercises()
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

  const handleVideoChange = (file: File | null) => {
    setVideoFile(file)
    setVideoError(null)
    setError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    if (bodyParts.length === 0) {
      setError('Оберіть хоча б одну частину тіла.')
      return
    }
    if (!videoFile && videoRequired) {
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
          apply_to_active_assignments: applyToActive,
        })
        await refreshExercises()
        if (videoFile) {
          // The old link points at the replaced video: drop it and load the new one.
          videoPreview.hide(updated.id)
          await videoPreview.show(updated.id)
        }
        cancelEditing()
        setNotice(describeEdit(editingExercise, updated, applyToActive))
      } else {
        await createExercise({
          name: form.name,
          description: form.description || null,
          reference_video_key: videoKey,
          joint_tolerances: {},
          body_parts: bodyParts,
        })
        if (offset > 0) updateQuery({ offset: '0' })
        else await refreshExercises()
        setForm({ name: '', description: '' })
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
      <Link to="/therapist/patients" className="back-link">
        <ArrowRightIcon /> До пацієнтів
      </Link>
      <PageHeading
        eyebrow="Кабінет лікаря"
        title="Бібліотека вправ"
        lead="Створюйте та переглядайте вправи для планів пацієнтів."
      />
      {notice && (
        <div className="success-message" role="status">
          {notice}
        </div>
      )}
      {error && <ErrorMessage title="Помилка" message={error} />}
      {videoPreview.error && (
        <ErrorMessage title="Не вдалося відкрити відео" message={videoPreview.error} />
      )}
      <div className="workspace-summary-grid therapist-page__grid">
        <ExerciseForm
          values={form}
          bodyParts={bodyParts}
          videoInputRef={videoInputRef}
          videoError={videoError}
          videoRequired={videoRequired}
          isEditing={Boolean(editingId)}
          activeAssignments={editingExercise?.active_assignments ?? 0}
          applyToActive={applyToActive}
          busy={busy}
          onApplyToActiveChange={setApplyToActive}
          onChange={setForm}
          onToggleBodyPart={toggleBodyPart}
          onVideoChange={handleVideoChange}
          onSubmit={handleSubmit}
          onCancel={cancelEditing}
        />
        <ExerciseLibrary
          exercises={exercises}
          total={total}
          query={q}
          limit={PAGE_SIZE}
          offset={offset}
          onQueryChange={(value) => updateQuery({ q: value, offset: '0' })}
          onPageChange={(nextOffset) => updateQuery({ offset: String(nextOffset) })}
          loading={loading}
          loadError={loadError}
          busy={busy}
          videoPreview={videoPreview}
          onEdit={startEditing}
          onDelete={(exercise) => void handleDelete(exercise)}
        />
      </div>
    </div>
  )
}
