import type { ReactNode } from 'react'
import type { Exercise } from '../../api/therapist'
import { EmptyState } from '../../components/EmptyState'
import { ErrorMessage } from '../../components/ErrorMessage'
import { EyeOffIcon, PencilIcon, TrashIcon } from '../../components/Icons'
import { Loading } from '../../components/Loading'
import { ReferenceVideo } from '../../components/ReferenceVideo'
import { ListPagination, ListSearch } from '../../components/ListControls'
import type { VideoPreview } from '../../lib/useVideoPreview'

interface ExerciseLibraryProps {
  exercises: Exercise[]
  total: number
  query: string
  limit: number
  offset: number
  onQueryChange: (value: string) => void
  onPageChange: (offset: number) => void
  loading: boolean
  loadError: string | null
  busy: boolean
  videoPreview: VideoPreview
  hiddenCount: number
  showingHidden: boolean
  /** Shown instead of the library while the hidden exercises are open. */
  hiddenView: ReactNode
  onToggleHidden: () => void
  onEdit: (exercise: Exercise) => void
  onHide: (exercise: Exercise) => void
  onDelete: (exercise: Exercise) => void
}

export function ExerciseLibrary({
  exercises,
  total,
  query,
  limit,
  offset,
  onQueryChange,
  onPageChange,
  loading,
  loadError,
  busy,
  videoPreview,
  hiddenCount,
  showingHidden,
  hiddenView,
  onToggleHidden,
  onEdit,
  onHide,
  onDelete,
}: ExerciseLibraryProps) {
  return (
    <section className="card">
      <div className="card__header">
        <div>
          <h2>{showingHidden ? `Приховані вправи (${hiddenCount})` : `Мої вправи (${total})`}</h2>
          <p>
            {showingHidden
              ? 'Їх немає в бібліотеці й не можна призначити, доки ви не повернете вправу.'
              : 'Вправи доступні для призначення пацієнтам.'}
          </p>
        </div>
        <button
          type="button"
          className="button button--ghost button--sm"
          aria-pressed={showingHidden}
          onClick={onToggleHidden}
        >
          {showingHidden ? 'Показати бібліотеку' : `Приховані вправи (${hiddenCount})`}
        </button>
      </div>

      {showingHidden ? (
        hiddenView
      ) : (
        <>
          <ListSearch
            label="Пошук вправ"
            value={query}
            placeholder="Назва вправи"
            onChange={onQueryChange}
          />
          <div className="exercise-library">
            {exercises.map((item) => (
              <article className="exercise-card" key={item.id}>
                <div>
                  <h3>{item.name}</h3>
                  <p>{item.description || 'Опис не додано.'}</p>
                  <small>
                    Версія {item.version} · призначень: {item.assignments_total} (активних:{' '}
                    {item.active_assignments})
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
                    className="icon-button"
                    aria-label={`Приховати ${item.name}`}
                    title="Приховати з бібліотеки"
                    onClick={() => onHide(item)}
                    disabled={busy}
                  >
                    <EyeOffIcon />
                  </button>
                  <button
                    type="button"
                    className="icon-button icon-button--danger"
                    aria-label={`Видалити ${item.name}`}
                    title={
                      item.assignments_total > 0
                        ? 'Вправа використовується в призначеннях, тому її не можна видалити. Її можна приховати.'
                        : 'Видалити'
                    }
                    onClick={() => onDelete(item)}
                    disabled={busy || item.assignments_total > 0}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </article>
            ))}
            {loading && <Loading label="Завантажуємо вправи…" />}
            {loadError && <ErrorMessage message={loadError} />}
            {!loading && !loadError && exercises.length === 0 && (
              <EmptyState
                message={query ? 'Вправ за цим пошуком не знайдено.' : 'Вправ поки немає.'}
              />
            )}
          </div>
          <ListPagination total={total} limit={limit} offset={offset} onChange={onPageChange} />
        </>
      )}
    </section>
  )
}
