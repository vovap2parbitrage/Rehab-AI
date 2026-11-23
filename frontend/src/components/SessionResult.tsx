import type { PatientSession } from '../api/patient'
import { SessionEvidence } from './SessionEvidence'

function formatSessionDate(session: PatientSession): string {
  return new Date(session.completed_at ?? session.created_at).toLocaleString('uk-UA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/** One saved session: pain, technique score, the analysis details and the recorded video. */
export function SessionResult({ session, title }: { session: PatientSession; title: string }) {
  return (
    <details className="assignment-session">
      <summary>
        <span>{title}</span>
        <time dateTime={session.completed_at ?? session.created_at}>
          {formatSessionDate(session)}
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
      <SessionEvidence
        sessionId={session.id}
        score={session.score}
        hasVideo={session.has_video}
        deviations={session.joint_deviations}
      />
    </details>
  )
}
