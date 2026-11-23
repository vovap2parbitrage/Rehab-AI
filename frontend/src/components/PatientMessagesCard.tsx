import { useEffect, useState, type FormEvent } from 'react'
import { listMyMessages, replyToMessage, type TherapistMessage } from '../api/messages'
import { getErrorMessage } from '../lib/errorMessage'
import { ErrorMessage } from './ErrorMessage'

/** Patient: messages from their therapists, each with one answer. Shows nothing without any. */
export function PatientMessagesCard() {
  const [messages, setMessages] = useState<TherapistMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    listMyMessages({ signal: controller.signal })
      .then(setMessages)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(getErrorMessage(reason, 'Не вдалося завантажити повідомлення від лікаря.'))
      })
    return () => controller.abort()
  }, [])

  const handleReply = async (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault()
    setBusyId(id)
    setError(null)
    try {
      const updated = await replyToMessage(id, (replies[id] ?? '').trim())
      setMessages((current) => current.map((item) => (item.id === id ? updated : item)))
    } catch (reason: unknown) {
      setError(getErrorMessage(reason, 'Не вдалося надіслати відповідь.'))
    } finally {
      setBusyId(null)
    }
  }

  if (messages.length === 0 && !error) return null
  const waiting = messages.filter((item) => item.reply === null).length

  return (
    <section className="card" aria-labelledby="doctor-messages-title">
      <div className="card__header">
        <div>
          <h2 id="doctor-messages-title">
            Повідомлення від лікаря{waiting > 0 && ` (чекають відповіді: ${waiting})`}
          </h2>
          <p>Лікар може запитати, чому пропущено заняття. Ви можете відповісти один раз.</p>
        </div>
      </div>
      {error && <ErrorMessage message={error} />}
      <div className="help-request-list">
        {messages.map((item) => {
          const reply = replies[item.id] ?? ''
          return (
            <article className="help-request" key={item.id}>
              <div className="help-request__meta">
                <strong>{item.therapist_name}</strong>
                <small>{new Date(item.created_at).toLocaleString('uk-UA')}</small>
              </div>
              <p>{item.message}</p>
              {item.reply !== null ? (
                <p className="help-request__reply">
                  <strong>Ваша відповідь:</strong> {item.reply}
                </p>
              ) : (
                <form className="therapist-form" onSubmit={(event) => handleReply(event, item.id)}>
                  <label className="therapist-form__field">
                    <span>Ваша відповідь лікарю</span>
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
                  <button
                    className="button button--primary"
                    disabled={busyId === item.id || !reply.trim()}
                  >
                    {busyId === item.id ? 'Надсилаємо…' : 'Відповісти'}
                  </button>
                </form>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
