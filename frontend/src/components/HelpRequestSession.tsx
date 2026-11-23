import type { HelpRequest } from '../api/helpRequests'
import { SessionEvidence } from './SessionEvidence'

/** Therapist: the analysis and video of the session a question is about. */
export function HelpRequestSession({ item }: { item: HelpRequest }) {
  if (item.score === null && !item.has_video) return null

  return (
    <details className="help-request__session">
      <summary>
        Сесія
        {item.score !== null && ` · оцінка ${item.score} із 10`}
        {item.has_video && ' · є відео'}
      </summary>
      <SessionEvidence
        sessionId={item.session_id}
        score={item.score}
        hasVideo={item.has_video}
        deviations={item.joint_deviations}
      />
    </details>
  )
}
