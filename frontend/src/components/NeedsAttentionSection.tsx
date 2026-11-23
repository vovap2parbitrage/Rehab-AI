import { EmptyState } from './EmptyState'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getErrorMessage } from '../lib/errorMessage'
import { HelpRequestSession } from './HelpRequestSession'
import { listNeedsAttention, replyToHelpRequest, type HelpRequest } from '../api/helpRequests'
import type { Page } from '../api/pagination'
import { useTherapistQuestions } from '../lib/therapistQuestionsContext'
import { ErrorMessage } from './ErrorMessage'
import { AlertTriangleIcon } from './Icons'
import { Loading } from './Loading'
import { ListPagination, ListSearch } from './ListControls'

const PAGE_SIZE = 20

/** Therapist: unanswered questions about their assignments ("Needs attention"). */
export function NeedsAttentionSection() {
  const { load: refreshCount } = useTherapistQuestions()
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0)
  const [data, setData] = useState<Page<HelpRequest> | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const requests = data?.items ?? []
  const [replyError, setReplyError] = useState<string | null>(null)
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadPage = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setLoadError(null)
      try {
        const page = await listNeedsAttention({ q, limit: PAGE_SIZE, offset, signal })
        if (!signal?.aborted) setData(page)
      } catch (reason: unknown) {
        if (!signal?.aborted) {
          setLoadError(getErrorMessage(reason, 'Не вдалося завантажити запитання пацієнтів.'))
        }
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [q, offset],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadPage(controller.signal)
    return () => controller.abort()
  }, [loadPage])

  const updateQuery = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    setSearchParams(next)
  }

  const handleReply = async (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault()
    setBusyId(id)
    setReplyError(null)
    try {
      await replyToHelpRequest(id, (replies[id] ?? '').trim())
      await loadPage()
      void refreshCount({ refresh: true, background: true })
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
          <h2 id="needs-attention-title">Потребують уваги ({data?.total ?? 0})</h2>
          <p>Запитання пацієнтів після виконання вправ. Після відповіді запит зникає зі списку.</p>
        </div>
        <span className="card__header-icon">
          <AlertTriangleIcon />
        </span>
      </div>
      {loadError && (
        <ErrorMessage title="Помилка" message={loadError} onRetry={() => void loadPage()} />
      )}
      {replyError && <ErrorMessage title="Помилка" message={replyError} />}
      <ListSearch
        label="Пошук запитань"
        value={q}
        placeholder="Ім’я пацієнта або текст"
        onChange={(value) => updateQuery({ q: value, offset: '0' })}
      />
      {loading ? (
        <Loading label="Завантажуємо запитання пацієнтів…" />
      ) : requests.length === 0 ? (
        data && (
          <EmptyState
            message={
              q ? 'Запитань за цим пошуком не знайдено.' : 'Нових запитань від пацієнтів немає.'
            }
          />
        )
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
                <HelpRequestSession item={item} />
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
      {!loading && data && (
        <ListPagination
          total={data.total}
          limit={PAGE_SIZE}
          offset={offset}
          onChange={(nextOffset) => updateQuery({ offset: String(nextOffset) })}
        />
      )}
    </section>
  )
}
