import { useId } from 'react'
import { usePatientHistory } from '../../lib/usePatientHistory'
import { ErrorMessage } from '../ErrorMessage'
import { Loading } from '../Loading'
import { AdherenceChart, PainChart, ScoreChart } from './HistoryCharts'
import { HistoryKpiCards } from './HistoryKpiCards'
import { PeriodSelector } from './PeriodSelector'

interface PatientHistorySectionProps {
  /** Omit to show the signed-in patient's own history. */
  patientId?: string
  title: string
  description: string
  emptyText: string
}

export function PatientHistorySection({
  patientId,
  title,
  description,
  emptyText,
}: PatientHistorySectionProps) {
  const headingId = useId()
  const { period, setPeriod, history, loading, error, notFound, refresh } =
    usePatientHistory(patientId)
  const empty = notFound || (history !== null && history.kpis.total_sessions === 0)

  let body
  if (error && !notFound) {
    body = (
      <ErrorMessage title="Не вдалося завантажити історію" message={error} onRetry={refresh} />
    )
  } else if (!history && !notFound) {
    body = <Loading label="Завантажуємо історію виконання…" />
  } else {
    body = (
      <div
        className={
          loading ? 'history-section__body history-section__body--loading' : 'history-section__body'
        }
      >
        {history && <HistoryKpiCards kpis={history.kpis} />}
        {empty && <p className="history-section__empty">{emptyText}</p>}
        {history && (
          <div className="history-charts">
            <PainChart points={history.pain_series} />
            <AdherenceChart weeks={history.adherence_weeks} />
            <ScoreChart points={history.score_series} />
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="card history-section" aria-labelledby={headingId} aria-busy={loading}>
      <div className="card__header history-section__header">
        <div>
          <h2 id={headingId}>{title}</h2>
          <p>{description}</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>
      {body}
    </section>
  )
}
