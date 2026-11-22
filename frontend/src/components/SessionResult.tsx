import type { PatientSession } from '../api/patient'
import { parseAnalysis } from '../lib/analysis'
import { AnalysisSummary } from './AnalysisSummary'
import { SessionVideo } from './SessionVideo'

function formatSessionDate(session: PatientSession): string {
  return new Date(session.completed_at ?? session.created_at).toLocaleString('uk-UA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/** One saved session: pain, technique score, the analysis details and the recorded video. */
export function SessionResult({ session, title }: { session: PatientSession; title: string }) {
  const analysis = parseAnalysis(session.joint_deviations)

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
      {session.score !== null && (
        <AnalysisSummary
          score={null}
          repetitions={analysis.repetitions}
          jointScores={analysis.jointScores}
          errors={analysis.errors}
        />
      )}
      {session.has_video && <SessionVideo sessionId={session.id} />}
    </details>
  )
}
