import type { Exercise } from '../../api/therapist'
import { EmptyState } from '../../components/EmptyState'
import { ErrorMessage } from '../../components/ErrorMessage'
import { PencilIcon, TrashIcon } from '../../components/Icons'
import { Loading } from '../../components/Loading'
import { ReferenceVideo } from '../../components/ReferenceVideo'
import type { VideoPreview } from '../../lib/useVideoPreview'

interface ExerciseLibraryProps {
  exercises: Exercise[]
  loading: boolean
  loadError: string | null
  busy: boolean
  videoPreview: VideoPreview
  onEdit: (exercise: Exercise) => void
  onDelete: (exercise: Exercise) => void
}

export function ExerciseLibrary({
  exercises,
  loading,
  loadError,
  busy,
  videoPreview,
  onEdit,
  onDelete,
}: ExerciseLibraryProps) {
  return (
    <section className="card">
      <div className="card__header">
        <div>
          <h2>Мої вправи ({exercises.length})</h2>
          <p>Вправи доступні для призначення пацієнтам.</p>
        </div>
      </div>

      <div className="exercise-library">
        {exercises.map((item) => (
          <article className="exercise-card" key={item.id}>
            <div>
              <h3>{item.name}</h3>
              <p>{item.description || 'Опис не додано.'}</p>
              <small>
                Версія {item.version} · активних призначень: {item.active_assignments}
              </small>
              {item.reference_video_key && (
                <ReferenceVideo
                  exerciseId={item.id}
                  preview={videoPreview}
                  showLabel="Переглянути відео"
                />
              )}
            </div>
            <div className="exercise-card__actions">
              <button
                type="button"
                className="icon-button"
                aria-label={`Змінити ${item.name}`}
                title="Змінити"
                onClick={() => onEdit(item)}
                disabled={busy}
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                className="icon-button icon-button--danger"
                aria-label={`Видалити ${item.name}`}
                title="Видалити"
                onClick={() => onDelete(item)}
                disabled={busy}
              >
                <TrashIcon />
              </button>
            </div>
          </article>
        ))}
        {loading && <Loading label="Завантажуємо вправи…" />}
        {loadError && <ErrorMessage message={loadError} />}
        {!loading && !loadError && exercises.length === 0 && (
          <EmptyState message="Вправ поки немає." />
        )}
      </div>
    </section>
  )
}
