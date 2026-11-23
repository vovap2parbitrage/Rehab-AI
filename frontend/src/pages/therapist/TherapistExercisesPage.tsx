import { useRef, useState, type FormEvent } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { ApiError } from '../../api/client'
import {
  createExercise,
  deleteExercise,
  hideExercise,
  restoreExercise,
  updateExercise,
  type Exercise,
} from '../../api/therapist'
import { ErrorMessage } from '../../components/ErrorMessage'
import { ArrowRightIcon } from '../../components/Icons'
import { PageHeading } from '../../components/PageHeading'
import { deleteUploadedVideo, uploadVideo } from '../../api/uploads'
import { getErrorMessage } from '../../lib/errorMessage'
import { useRefreshOnEntry } from '../../lib/useCachedResource'
import { useVideoPreview } from '../../lib/useVideoPreview'
import { ExerciseForm } from './ExerciseForm'
import { ExerciseLibrary } from './ExerciseLibrary'
import { HiddenExercises } from './HiddenExercises'
import type { TherapistWorkspaceResources } from './TherapistWorkspaceLayout'

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
  const {
    exercises: resource,
    hiddenExercises: hiddenResource,
    scoringOptions: scoringResource,
  } = useOutletContext<TherapistWorkspaceResources>()
  useRefreshOnEntry(resource)
  useRefreshOnEntry(hiddenResource)
  useRefreshOnEntry(scoringResource)
  const { data: exercises = [], loading, error: loadError, update: updateExercises } = resource
  const { data: hiddenExercises = [] } = hiddenResource
  const { data: scoringOptions } = scoringResource
  const [showHidden, setShowHidden] = useState(false)
  // What the doctor typed for each joint; an empty value means the default tolerance.
  const [tolerances, setTolerances] = useState<Record<string, string>>({})
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

  const startEditing = (exercise: Exercise) => {
    setEditingId(exercise.id)
    setForm({
      name: exercise.name,
      description: exercise.description || '',
    })
    setBodyParts(exercise.body_parts)
    setTolerances(
      Object.fromEntries(
        Object.entries(exercise.joint_tolerances).map(([joint, value]) => [joint, String(value)]),
      ),
    )
    setApplyToActive(false)
    setVideoFile(null)
    if (videoInputRef.current) videoInputRef.current.value = ''
    setNotice(null)
    setError(null)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setApplyToActive(false)
    setTolerances({})
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
      updateExercises((current) => current.filter((item) => item.id !== exercise.id))
      if (editingId === exercise.id) cancelEditing()
      setNotice('Вправу видалено.')
    } catch (reason: unknown) {
      setError(getErrorMessage(reason, 'Не вдалося видалити вправу.'))
    } finally {
      setBusy(false)
    }
  }

  const handleHide = async (exercise: Exercise) => {
    setBusy(true)
    setError(null)
    try {
      await hideExercise(exercise.id)
      updateExercises((current) => current.filter((item) => item.id !== exercise.id))
      hiddenResource.invalidate()
      if (editingId === exercise.id) cancelEditing()
      setNotice('Вправу приховано. Її можна повернути в розділі «Приховані вправи».')
    } catch (reason: unknown) {
      setError(getErrorMessage(reason, 'Не вдалося приховати вправу.'))
    } finally {
      setBusy(false)
    }
  }

  const handleRestore = async (exercise: Exercise) => {
    setBusy(true)
    setError(null)
    try {
      await restoreExercise(exercise.id)
      hiddenResource.update((current) => current.filter((item) => item.id !== exercise.id))
      resource.invalidate()
      setNotice('Вправу повернуто до бібліотеки.')
    } catch (reason: unknown) {
      setError(getErrorMessage(reason, 'Не вдалося повернути вправу.'))
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

  /** The typed tolerances of the joints that are still part of the exercise, as numbers. */
  const collectTolerances = (): Record<string, number> | null => {
    // Without the joint list nothing can be checked, so an edit keeps what is saved.
    if (!scoringOptions) return editingExercise?.joint_tolerances ?? {}
    const result: Record<string, number> = {}
    const allowed = new Set(
      bodyParts.flatMap((part) => scoringOptions?.joints_by_body_part[part] ?? []),
    )
    const max = scoringOptions?.max_tolerance_deg ?? 90
    for (const [joint, typed] of Object.entries(tolerances)) {
      if (!allowed.has(joint) || typed.trim() === '') continue
      const value = Number(typed)
      if (!Number.isFinite(value) || value < 1 || value > max) {
        setError(`Допуск має бути числом від 1 до ${max}.`)
        return null
      }
      result[joint] = value
    }
    return result
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    if (bodyParts.length === 0) {
      setError('Оберіть хоча б одну частину тіла.')
      return
    }
    const jointTolerances = collectTolerances()
    if (!jointTolerances) return
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
          joint_tolerances: jointTolerances,
          body_parts: bodyParts,
          apply_to_active_assignments: applyToActive,
        })
        updateExercises((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        )
        if (videoFile) {
          // The old link points at the replaced video: drop it and load the new one.
          videoPreview.hide(updated.id)
          await videoPreview.show(updated.id)
        }
        cancelEditing()
        setNotice(describeEdit(editingExercise, updated, applyToActive))
      } else {
        const created = await createExercise({
          name: form.name,
          description: form.description || null,
          reference_video_key: videoKey,
          joint_tolerances: jointTolerances,
          body_parts: bodyParts,
        })
        updateExercises((current) =>
          current.some((item) => item.id === created.id) ? current : [...current, created],
        )
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
          scoringOptions={scoringOptions}
          tolerances={tolerances}
          onToleranceChange={(joint, value) =>
            setTolerances((current) => ({ ...current, [joint]: value }))
          }
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
          loading={loading}
          loadError={loadError}
          busy={busy}
          videoPreview={videoPreview}
          hiddenCount={hiddenExercises.length}
          showingHidden={showHidden}
          hiddenView={
            <HiddenExercises
              exercises={hiddenExercises}
              loading={hiddenResource.loading}
              loadError={hiddenResource.error}
              busy={busy}
              onRestore={(exercise) => void handleRestore(exercise)}
            />
          }
          onToggleHidden={() => setShowHidden((current) => !current)}
          onEdit={startEditing}
          onHide={(exercise) => void handleHide(exercise)}
          onDelete={(exercise) => void handleDelete(exercise)}
        />
      </div>
    </div>
  )
}
