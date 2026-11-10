import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client'
import {
  HELP_REQUESTS_CHANGED_EVENT,
  listNeedsAttention,
  replyToHelpRequest,
  type HelpRequest,
} from '../api/helpRequests'
import { ErrorMessage } from './ErrorMessage'
import { AlertTriangleIcon } from './Icons'
import { Loading } from './Loading'

function errorText(reason: unknown, fallback: string): string {
  return reason instanceof ApiError ? reason.detail || reason.message : fallback
}

/** Therapist: unanswered questions about their assignments ("Needs attention"). */
export function NeedsAttentionSection() {
  const [requests, setRequests] = useState<HelpRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    listNeedsAttention(controller.signal)
      .then(setRequests)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(errorText(reason, 'Не вдалося завантажити запитання пацієнтів.'))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  const handleReply = async (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault()
    setBusyId(id)
    setError(null)
    try {
      await replyToHelpRequest(id, (replies[id] ?? '').trim())
      setRequests((current) => current.filter((item) => item.id !== id))
      window.dispatchEvent(new Event(HELP_REQUESTS_CHANGED_EVENT))
    } catch (reason: unknown) {
      setError(errorText(reason, 'Не вдалося надіслати відповідь.'))
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
        <span className="card__header-icon"><AlertTriangleIcon /></span>
      </div>
      {error && <ErrorMessage title="Помилка" message={error} />}
      {loading ? (
        <Loading label="Завантажуємо запитання пацієнтів…" />
      ) : requests.length === 0 ? (
        <p className="therapist-list__empty">Нових запитань від пацієнтів немає.</p>
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
