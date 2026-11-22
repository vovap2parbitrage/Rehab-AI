import type { PatientAssignment } from '../../api/patient'
import { AnalysisSummary } from '../../components/AnalysisSummary'
import { SessionVideo } from '../../components/SessionVideo'
import { parseAnalysis } from '../../lib/analysis'

function formatSessionDate(value: string | null, fallback: string): string {
  return new Date(value ?? fallback).toLocaleString('uk-UA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function SessionAnalysis({ session }: { session: PatientAssignment['sessions'][number] }) {
  const details = parseAnalysis(session.joint_deviations)

  return (
    <AnalysisSummary
      score={null}
      repetitions={details.repetitions}
      jointScores={details.jointScores}
      errors={details.errors}
    />
  )
}

export function SessionDetails({ assignment }: { assignment: PatientAssignment }) {
  if (!assignment.sessions.length) return null

  return (
    <div className="assignment-sessions">
      <h3>Виконані сесії</h3>
      {assignment.sessions
        .slice()
        .sort((left, right) => {
          const leftDate = left.completed_at ?? left.created_at
          const rightDate = right.completed_at ?? right.created_at
          return rightDate.localeCompare(leftDate)
        })
        .map((session, index) => (
          <details className="assignment-session" key={session.id}>
            <summary>
              <span>Сесія {assignment.sessions.length - index}</span>
              <time dateTime={session.completed_at ?? session.created_at}>
                {formatSessionDate(session.completed_at, session.created_at)}
              </time>
            </summary>
            <dl className="assignment-session__details">
              <div>
                <dt>Біль</dt>
                <dd>{session.pain_score === null ? 'Не вказано' : `${session.pain_score} із 10`}</dd>
              </div>
              <div>
                <dt>Оцінка техніки</dt>
                <dd>{session.score === null ? 'Аналіз ще не доступний' : `${session.score} із 10`}</dd>
              </div>
            </dl>
            {session.score !== null && <SessionAnalysis session={session} />}
            {session.has_video && <SessionVideo sessionId={session.id} />}
          </details>
        ))}
    </div>
  )
}
