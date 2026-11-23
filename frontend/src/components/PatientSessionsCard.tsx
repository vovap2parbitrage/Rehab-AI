import { useCallback, useEffect, useState } from 'react'
import type { PatientSession } from '../api/patient'
import type { Page } from '../api/pagination'
import { listPatientSessions } from '../api/sessions'
import { getErrorMessage } from '../lib/errorMessage'
import { useSearchParams } from 'react-router-dom'
import { CalendarIcon } from './Icons'
import { EmptyState } from './EmptyState'
import { ErrorMessage } from './ErrorMessage'
import { ListPagination } from './ListControls'
import { Loading } from './Loading'
import { SessionResult } from './SessionResult'

const PAGE_SIZE = 20

interface PatientSessionsCardProps {
  patientId: string
  /** Name shown for the exercise of an assignment. */
  exerciseNameFor: (assignmentId: string) => string
}

/** Therapist: a page of the patient's sessions with their analysis and recorded video. */
export function PatientSessionsCard({ patientId, exerciseNameFor }: PatientSessionsCardProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const offset = Math.max(0, Number(searchParams.get('sessionsOffset')) || 0)
  const [data, setData] = useState<Page<PatientSession> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadPage = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const page = await listPatientSessions(patientId, {
          limit: PAGE_SIZE,
          offset,
          signal,
        })
        if (!signal?.aborted) setData(page)
      } catch (reason: unknown) {
        if (!signal?.aborted) {
          setError(getErrorMessage(reason, 'Не вдалося завантажити сесії пацієнта.'))
        }
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [patientId, offset],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadPage(controller.signal)
    return () => controller.abort()
  }, [loadPage])

  const updateOffset = (nextOffset: number) => {
    const next = new URLSearchParams(searchParams)
    if (nextOffset === 0) next.delete('sessionsOffset')
    else next.set('sessionsOffset', String(nextOffset))
    setSearchParams(next)
  }

  const sessions = data?.items ?? []

  return (
    <section className="card" aria-labelledby="patient-sessions-title">
      <div className="card__header">
        <div>
          <h2 id="patient-sessions-title">Сесії пацієнта ({data?.total ?? 0})</h2>
          <p>Відео виконання, оцінка техніки та помилки по суглобах.</p>
        </div>
        <span className="card__header-icon">
          <CalendarIcon />
        </span>
      </div>
      {error && <ErrorMessage message={error} />}
      {loading ? (
        <Loading label="Завантажуємо сесії…" />
      ) : error ? null : sessions.length === 0 ? (
        <EmptyState message="Пацієнт ще не завершив жодної сесії." />
      ) : (
        <div className="assignment-sessions">
          {sessions.map((session) => (
            <SessionResult
              key={session.id}
              session={session}
              title={`${exerciseNameFor(session.assignment_id)}${
                session.score === null ? '' : ` · ${session.score} із 10`
              }`}
            />
          ))}
          <ListPagination
            total={data?.total ?? 0}
            limit={PAGE_SIZE}
            offset={offset}
            onChange={updateOffset}
          />
        </div>
      )}
    </section>
  )
}
