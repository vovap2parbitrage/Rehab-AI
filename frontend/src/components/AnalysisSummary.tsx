import type { ErrorSegment } from '../api/comparisons'
import { directionLabel, jointLabel } from '../lib/jointLabels'

interface AnalysisSummaryProps {
  score: number | null
  repetitions: number | null
  jointScores: Record<string, number> | null
  errors: ErrorSegment[] | null
}

/** Score, joints and technique errors of one analysed video. */
export function AnalysisSummary({ score, repetitions, jointScores, errors }: AnalysisSummaryProps) {
  const joints = jointScores ? Object.entries(jointScores) : []

  return (
    <div className="analysis-summary">
      {score !== null && (
        <p className="analysis-summary__score">
          <strong>{score}</strong> із 10
          {repetitions !== null && <span> · повторень: {repetitions}</span>}
        </p>
      )}
      {joints.length > 0 && (
        <ul className="analysis-summary__list" aria-label="Оцінка по суглобах">
          {joints.map(([joint, value]) => (
            <li key={joint}>
              <span>{jointLabel(joint)}</span>
              <span>{value} із 10</span>
            </li>
          ))}
        </ul>
      )}
      {errors !== null && errors.length === 0 && <p>Помилок техніки не виявлено.</p>}
      {errors !== null && errors.length > 0 && (
        <>
          <h3>Помилки техніки</h3>
          <ul className="analysis-summary__list" aria-label="Помилки техніки">
            {errors.map((error, index) => (
              <li key={`${error.joint}-${index}`}>
                <span>
                  {jointLabel(error.joint)}: {directionLabel(error.direction)}
                </span>
                <span>
                  {error.start_s.toFixed(1)}–{error.end_s.toFixed(1)} с · до{' '}
                  {error.peak_deviation_deg.toFixed(0)}°
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
