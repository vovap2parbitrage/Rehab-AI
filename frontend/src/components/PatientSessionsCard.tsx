import { useEffect, useState } from 'react'
import type { PatientSession } from '../api/patient'
import { listPatientSessions } from '../api/sessions'
import { getErrorMessage } from '../lib/errorMessage'
import { CalendarIcon } from './Icons'
import { EmptyState } from './EmptyState'
import { ErrorMessage } from './ErrorMessage'
import { Loading } from './Loading'
import { SessionResult } from './SessionResult'

const PAGE_SIZE = 10

function sessionDate(session: PatientSession): string {
  return session.completed_at ?? session.created_at
}

interface PatientSessionsCardProps {
  patientId: string
  /** Name shown for the exercise of an assignment. */
  exerciseNameFor: (assignmentId: string) => string
}

/** Therapist: every session of the patient with its analysis and recorded video. */
export function PatientSessionsCard({ patientId, exerciseNameFor }: PatientSessionsCardProps) {
  const [sessions, setSessions] = useState<PatientSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(PAGE_SIZE)

  useEffect(() => {
    const controller = new AbortController()
    listPatientSessions(patientId, { signal: controller.signal })
      .then((loaded) => {
        setSessions(loaded.slice().sort((a, b) => sessionDate(b).localeCompare(sessionDate(a))))
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(getErrorMessage(reason, 'Не вдалося завантажити сесії пацієнта.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [patientId])

  return (
    <section className="card" aria-labelledby="patient-sessions-title">
      <div className="card__header">
        <div>
          <h2 id="patient-sessions-title">Сесії пацієнта ({sessions.length})</h2>
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
          {sessions.slice(0, visible).map((session) => (
            <SessionResult
              key={session.id}
              session={session}
              title={`${exerciseNameFor(session.assignment_id)}${
                session.score === null ? '' : ` · ${session.score} із 10`
              }`}
            />
          ))}
          {sessions.length > visible && (
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setVisible((count) => count + PAGE_SIZE)}
            >
              Показати ще ({sessions.length - visible})
            </button>
          )}
        </div>
      )}
    </section>
  )
}
