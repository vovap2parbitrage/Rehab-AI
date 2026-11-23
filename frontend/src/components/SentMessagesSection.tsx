import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listSentMessages, markReplySeen, type TherapistMessage } from '../api/messages'
import { getErrorMessage } from '../lib/errorMessage'
import { EmptyState } from './EmptyState'
import { ErrorMessage } from './ErrorMessage'
import { Loading } from './Loading'

const PAGE_SIZE = 10

/** Therapist: what they wrote to patients, and the patients' answers. */
export function SentMessagesSection() {
  const [messages, setMessages] = useState<TherapistMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(PAGE_SIZE)
  const newReplies = messages.filter((item) => item.reply !== null && !item.reply_seen).length

  useEffect(() => {
    const controller = new AbortController()
    listSentMessages({ signal: controller.signal })
      .then(setMessages)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(getErrorMessage(reason, 'Не вдалося завантажити повідомлення пацієнтам.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  const handleSeen = async (id: string) => {
    try {
      await markReplySeen(id)
      setMessages((current) =>
        current.map((item) => (item.id === id ? { ...item, reply_seen: true } : item)),
      )
    } catch (reason: unknown) {
      setError(getErrorMessage(reason, 'Не вдалося позначити відповідь прочитаною.'))
    }
  }

  return (
    <section className="card" aria-labelledby="sent-messages-title">
      <div className="card__header">
        <div>
          <h2 id="sent-messages-title">
            Повідомлення пацієнтам{newReplies > 0 && ` (нових відповідей: ${newReplies})`}
          </h2>
          <p>Ваші повідомлення, наприклад про пропущені заняття, і відповіді пацієнтів.</p>
        </div>
      </div>
      {error && <ErrorMessage message={error} />}
      {loading ? (
        <Loading label="Завантажуємо повідомлення…" />
      ) : messages.length === 0 ? (
        !error && <EmptyState message="Ви ще нікому не писали." />
      ) : (
        <div className="help-request-list">
          {messages.slice(0, visible).map((item) => (
            <article className="help-request" key={item.id}>
              <div className="help-request__meta">
                <Link to={`/therapist/patients/${item.patient_id}`}>
                  <strong>{item.patient_name || 'Пацієнт'}</strong>
                </Link>
                <small>{new Date(item.created_at).toLocaleString('uk-UA')}</small>
                <span
                  className={
                    item.reply === null
                      ? 'status-pill status-pill--pending status-pill--sm'
                      : item.reply_seen
                        ? 'status-pill status-pill--success status-pill--sm'
                        : 'status-pill status-pill--danger status-pill--sm'
                  }
                >
                  {item.reply === null
                    ? 'Очікує відповіді'
                    : item.reply_seen
                      ? 'Відповідь прочитано'
                      : 'Нова відповідь'}
                </span>
              </div>
              <p>{item.message}</p>
              {item.reply !== null && (
                <p className="help-request__reply">
                  <strong>Відповідь пацієнта:</strong> {item.reply}
                </p>
              )}
              {item.reply !== null && !item.reply_seen && (
                <button
                  type="button"
                  className="button button--ghost button--sm"
                  onClick={() => void handleSeen(item.id)}
                >
                  Прочитано
                </button>
              )}
            </article>
          ))}
          {messages.length > visible && (
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setVisible((count) => count + PAGE_SIZE)}
            >
              Показати ще ({messages.length - visible})
            </button>
          )}
        </div>
      )}
    </section>
  )
}
