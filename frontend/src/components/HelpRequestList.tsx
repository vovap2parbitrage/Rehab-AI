import type { HelpRequest } from '../api/helpRequests'

interface HelpRequestListProps {
  items: HelpRequest[]
  /** Show the exercise name (not needed when the list already sits under one exercise). */
  showExercise?: boolean
  /** Short preview: the question and the reply are cut to one line each. */
  compact?: boolean
}

/** Read-only list of patient questions with the therapist's replies. */
export function HelpRequestList({ items, showExercise = false, compact = false }: HelpRequestListProps) {
  return (
    <div className={compact ? 'help-request-list help-request-list--compact' : 'help-request-list'}>
      {items.map((item) => (
        <article className="help-request" key={item.id}>
          <div className="help-request__meta">
            {showExercise && <strong>{item.exercise_name}</strong>}
            <small>
              {new Date(item.created_at).toLocaleString('uk-UA')}
              {item.pain_score !== null && ` · біль ${item.pain_score} із 10`}
            </small>
            <span
              className={
                item.reply
                  ? 'status-pill status-pill--success status-pill--sm'
                  : 'status-pill status-pill--pending status-pill--sm'
              }
            >
              {item.reply ? 'Лікар відповів' : 'Очікує відповіді'}
            </span>
          </div>
          <p>{item.message}</p>
          {item.reply && (
            <p className="help-request__reply">
              <strong>Відповідь лікаря{item.replied_by_email && ` (${item.replied_by_email})`}:</strong>{' '}
              {item.reply}
            </p>
          )}
        </article>
      ))}
    </div>
  )
}
