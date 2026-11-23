import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listPatientHelpRequests, type HelpRequest } from '../api/helpRequests'
import type { Page } from '../api/pagination'
import { EmptyState } from './EmptyState'
import { ErrorMessage } from './ErrorMessage'
import { HelpRequestList } from './HelpRequestList'
import { MailIcon } from './Icons'
import { ListPagination, ListSearch } from './ListControls'
import { Loading } from './Loading'
import { getErrorMessage } from '../lib/errorMessage'

const PREVIEW_COUNT = 1
const PAGE_SIZE = 20

/** Therapist: the patient's latest questions; the full history opens in a dialog. */
export function PatientQuestionsCard({ patientId }: { patientId: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('questionsQ') ?? ''
  const offset = Math.max(0, Number(searchParams.get('questionsOffset')) || 0)
  const [data, setData] = useState<Page<HelpRequest> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const items = data?.items ?? []
  const waiting = items.filter((item) => !item.reply).length

  const loadPage = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const page = await listPatientHelpRequests(patientId, {
          q,
          limit: PAGE_SIZE,
          offset,
          signal,
        })
        if (!signal?.aborted) setData(page)
      } catch (reason: unknown) {
        if (!signal?.aborted) {
          setError(getErrorMessage(reason, 'Не вдалося завантажити запитання пацієнта.'))
        }
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [patientId, q, offset],
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

  return (
    <section className="card patient-questions" aria-labelledby="patient-questions-title">
      <div className="card__header">
        <div>
          <h2 id="patient-questions-title">Запитання пацієнта ({data?.total ?? 0})</h2>
          <p>Останнє запитання після виконання ваших призначень.</p>
        </div>
        <span className="card__header-icon">
          <MailIcon />
        </span>
      </div>
      {error && <ErrorMessage message={error} />}
      {loading ? (
        <Loading label="Завантажуємо запитання…" />
      ) : error ? null : (data?.total ?? 0) === 0 ? (
        <EmptyState
          message={q ? 'Запитань за цим пошуком не знайдено.' : 'Пацієнт ще не ставив запитань.'}
        />
      ) : (
        <>
          <HelpRequestList items={items.slice(0, PREVIEW_COUNT)} showExercise compact />
          <div className="patient-questions__actions">
            <button
              type="button"
              className="button button--ghost"
              onClick={() => dialogRef.current?.showModal()}
            >
              Усі запитання ({data?.total})
            </button>
            {waiting > 0 && (
              <Link to="/therapist/questions" className="button button--primary">
                Відповісти ({waiting})
              </Link>
            )}
          </div>
        </>
      )}

      <dialog
        ref={dialogRef}
        className="questions-dialog"
        aria-labelledby="questions-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close()
        }}
      >
        <div className="questions-dialog__header">
          <h2 id="questions-dialog-title">Усі запитання пацієнта</h2>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => dialogRef.current?.close()}
          >
            Закрити
          </button>
        </div>
        <ListSearch
          label="Пошук запитань"
          value={q}
          placeholder="Ім’я пацієнта або текст"
          onChange={(value) => updateQuery({ questionsQ: value, questionsOffset: '0' })}
        />
        {loading ? (
          <Loading label="Завантажуємо запитання…" />
        ) : (
          <>
            <HelpRequestList items={items} showExercise />
            <ListPagination
              total={data?.total ?? 0}
              limit={PAGE_SIZE}
              offset={offset}
              onChange={(nextOffset) => updateQuery({ questionsOffset: String(nextOffset) })}
            />
          </>
        )}
      </dialog>
    </section>
  )
}
