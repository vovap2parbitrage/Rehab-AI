import { parseAnalysis } from '../lib/analysis'
import { AnalysisSummary } from './AnalysisSummary'
import { SessionVideo } from './SessionVideo'

interface SessionEvidenceProps {
  sessionId: string
  score: number | null
  hasVideo: boolean
  deviations: Record<string, unknown>
}

/** What was recorded in a session: the analysis details and the video. */
export function SessionEvidence({ sessionId, score, hasVideo, deviations }: SessionEvidenceProps) {
  const analysis = parseAnalysis(deviations)

  return (
    <>
      {score !== null && (
        <AnalysisSummary
          score={null}
          repetitions={analysis.repetitions}
          jointScores={analysis.jointScores}
          errors={analysis.errors}
        />
      )}
      {hasVideo && <SessionVideo sessionId={sessionId} />}
    </>
  )
}
