import type { FormEvent, RefObject } from 'react'
import { CheckIcon } from '../../components/Icons'
import { BODY_PARTS } from '../../lib/bodyParts'

interface ExerciseFormProps {
  values: { name: string; description: string }
  bodyParts: string[]
  videoInputRef: RefObject<HTMLInputElement | null>
  videoError: string | null
  videoRequired: boolean
  isEditing: boolean
  /** Active assignments of the exercise being edited. */
  activeAssignments: number
  applyToActive: boolean
  busy: boolean
  onApplyToActiveChange: (apply: boolean) => void
  onChange: (values: ExerciseFormProps['values']) => void
  onToggleBodyPart: (part: string) => void
  onVideoChange: (file: File | null) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}

export function ExerciseForm({
  values,
  bodyParts,
  videoInputRef,
  videoError,
  videoRequired,
  isEditing,
  activeAssignments,
  applyToActive,
  busy,
  onApplyToActiveChange,
  onChange,
  onToggleBodyPart,
  onVideoChange,
  onSubmit,
  onCancel,
}: ExerciseFormProps) {
  return (
    <section className="card">
      <div className="card__header">
        <div>
          <h2>{isEditing ? 'Редагування вправи' : 'Нова вправа'}</h2>
          <p>
            {isEditing
              ? 'Нову версію вправи створюють лише зміна відео, частин тіла чи допусків.'
              : 'Додайте назву, опис і відео вправи.'}
          </p>
        </div>
        <span className="card__header-icon">
          <CheckIcon />
        </span>
      </div>

      <form className="therapist-form" onSubmit={onSubmit}>
        <label className="therapist-form__field">
          <span>Назва *</span>
          <input
            value={values.name}
            onChange={(event) => onChange({ ...values, name: event.target.value })}
            required
            minLength={2}
          />
        </label>
        <label className="therapist-form__field">
          <span>Опис</span>
          <textarea
            rows={4}
            value={values.description}
            onChange={(event) => onChange({ ...values, description: event.target.value })}
          />
        </label>
        <div className="therapist-form__field">
          <span>Частини тіла *</span>
          <div className="therapist-form__body-parts">
            {BODY_PARTS.map((part) => (
              <label className="therapist-form__body-part" key={part.value}>
                <input
                  type="checkbox"
                  checked={bodyParts.includes(part.value)}
                  onChange={() => onToggleBodyPart(part.value)}
                />
                {part.label}
              </label>
            ))}
          </div>
        </div>
        <label className="therapist-form__field">
          <span>Відео {videoRequired && '*'}</span>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/quicktime"
            onChange={(event) => onVideoChange(event.target.files?.[0] ?? null)}
            required={videoRequired}
          />
        </label>
        {videoError && <p className="error-message">{videoError}</p>}
        {isEditing && activeAssignments > 0 && (
          <label className="therapist-form__field therapist-form__apply">
            <span>
              <input
                type="checkbox"
                checked={applyToActive}
                onChange={(event) => onApplyToActiveChange(event.target.checked)}
              />
              Застосувати до активних призначень ({activeAssignments})
            </span>
            <small>
              Без цього вони лишаються на попередній версії й порівнюються зі старим еталоном.
            </small>
          </label>
        )}
        <button className="button button--primary" disabled={busy}>
          {busy ? 'Зберігаємо…' : isEditing ? 'Зберегти зміни' : 'Створити вправу'}
        </button>
        {isEditing && (
          <button type="button" className="button button--ghost" onClick={onCancel}>
            Скасувати
          </button>
        )}
      </form>
    </section>
  )
}
