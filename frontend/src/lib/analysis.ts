import type { ErrorSegment } from '../api/comparisons'

export interface AnalysisDetails {
  repetitions: number | null
  jointScores: Record<string, number> | null
  errors: ErrorSegment[] | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reads the analysis details stored with a session; unknown shapes give nulls. */
export function parseAnalysis(deviations: Record<string, unknown>): AnalysisDetails {
  const rawScores = deviations.joint_scores
  const jointScores = isRecord(rawScores)
    ? Object.fromEntries(
        Object.entries(rawScores).filter(
          (entry): entry is [string, number] => typeof entry[1] === 'number',
        ),
      )
    : null

  return {
    repetitions: typeof deviations.repetitions === 'number' ? deviations.repetitions : null,
    jointScores,
    errors: Array.isArray(deviations.errors) ? (deviations.errors as ErrorSegment[]) : null,
  }
}
