import type { Exercise } from '../../api/therapist'
import { EmptyState } from '../../components/EmptyState'
import { ErrorMessage } from '../../components/ErrorMessage'
import { RefreshIcon } from '../../components/Icons'
import { Loading } from '../../components/Loading'

interface HiddenExercisesProps {
  exercises: Exercise[]
  loading: boolean
  loadError: string | null
  busy: boolean
  onRestore: (exercise: Exercise) => void
}

/** Exercises the doctor has hidden from the library; each can be brought back. */
export function HiddenExercises({
  exercises,
  loading,
  loadError,
  busy,
  onRestore,
}: HiddenExercisesProps) {
  return (
    <div className="exercise-library exercise-library--hidden">
      {exercises.map((item) => (
        <article className="exercise-card" key={item.id}>
          <div>
            <h3>{item.name}</h3>
            <p>{item.description || 'Опис не додано.'}</p>
          </div>
          <div className="exercise-card__actions">
            <button
              type="button"
              className="button button--ghost button--sm"
              onClick={() => onRestore(item)}
              disabled={busy}
            >
              <RefreshIcon aria-hidden="true" /> Повернути
            </button>
          </div>
        </article>
      ))}
      {loading && <Loading label="Завантажуємо приховані вправи…" />}
      {loadError && <ErrorMessage message={loadError} />}
      {!loading && !loadError && exercises.length === 0 && (
        <EmptyState message="Прихованих вправ немає." />
      )}
    </div>
  )
}
