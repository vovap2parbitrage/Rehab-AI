import { EmptyState } from './EmptyState'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { getErrorMessage } from '../lib/errorMessage'
import { replyToHelpRequest } from '../api/helpRequests'
import { useTherapistQuestions } from '../lib/therapistQuestionsContext'
import { ErrorMessage } from './ErrorMessage'
import { AlertTriangleIcon } from './Icons'
import { Loading } from './Loading'

/** Therapist: unanswered questions about their assignments ("Needs attention"). */
export function NeedsAttentionSection() {
  const { data, loading, error: loadError, load, update } = useTherapistQuestions()
  const requests = data ?? []
  const [replyError, setReplyError] = useState<string | null>(null)
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const handleReply = async (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault()
    setBusyId(id)
    setReplyError(null)
    try {
      await replyToHelpRequest(id, (replies[id] ?? '').trim())
      update((current) => current.filter((item) => item.id !== id))
      void load({ refresh: true, background: true })
    } catch (reason: unknown) {
      setReplyError(getErrorMessage(reason, 'Не вдалося надіслати відповідь.'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="card" aria-labelledby="needs-attention-title">
      <div className="card__header">
        <div>
          <h2 id="needs-attention-title">Потребують уваги ({requests.length})</h2>
          <p>Запитання пацієнтів після виконання вправ. Після відповіді запит зникає зі списку.</p>
        </div>
        <span className="card__header-icon">
          <AlertTriangleIcon />
        </span>
      </div>
      {loadError && (
        <ErrorMessage
          title="Помилка"
          message={loadError}
          onRetry={() => void load({ refresh: true })}
        />
      )}
      {replyError && <ErrorMessage title="Помилка" message={replyError} />}
      {loading ? (
        <Loading label="Завантажуємо запитання пацієнтів…" />
      ) : requests.length === 0 ? (
        data && <EmptyState message="Нових запитань від пацієнтів немає." />
      ) : (
        <div className="help-request-list">
          {requests.map((item) => {
            const reply = replies[item.id] ?? ''
            const busy = busyId === item.id
            return (
              <article className="help-request" key={item.id}>
                <div className="help-request__meta">
                  <Link to={`/therapist/patients/${item.patient_id}`}>
                    <strong>{item.patient_name}</strong>
                  </Link>
                  <small>
                    {item.exercise_name}
                    {item.pain_score !== null && ` · біль ${item.pain_score} із 10`}
                    {' · '}
                    {new Date(item.created_at).toLocaleString('uk-UA')}
                  </small>
                </div>
                <p>{item.message}</p>
                <form className="therapist-form" onSubmit={(event) => handleReply(event, item.id)}>
                  <label className="therapist-form__field">
                    <span>Відповідь пацієнту</span>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={reply}
                      onChange={(event) => {
                        const value = event.currentTarget.value
                        setReplies((current) => ({ ...current, [item.id]: value }))
                      }}
                      required
                    />
                  </label>
                  <button className="button button--primary" disabled={busy || !reply.trim()}>
                    {busy ? 'Надсилаємо…' : 'Відповісти'}
                  </button>
                </form>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
