import type { HistoryKpis } from '../../api/history'
import { formatDateTime, formatNumber } from './format'

function painTrendLabel(trend: number | null): { text: string; tone: string } {
  if (trend === null) return { text: 'Замало даних для тренду', tone: 'neutral' }
  if (trend < 0) return { text: `Знижується на ${formatNumber(-trend)}`, tone: 'good' }
  if (trend > 0) return { text: `Зростає на ${formatNumber(trend)}`, tone: 'bad' }
  return { text: 'Без змін', tone: 'neutral' }
}

export function HistoryKpiCards({ kpis }: { kpis: HistoryKpis }) {
  const trend = painTrendLabel(kpis.pain_trend)

  return (
    <dl className="history-kpis">
      <div className="history-kpi">
        <dt>Виконано сесій</dt>
        <dd>{kpis.total_sessions}</dd>
        <small>
          {kpis.last_session_at
            ? `Остання: ${formatDateTime(kpis.last_session_at)}`
            : 'Сесій ще не було'}
        </small>
      </div>
      <div className="history-kpi">
        <dt>Виконання плану</dt>
        <dd>{kpis.adherence_pct === null ? '—' : `${formatNumber(kpis.adherence_pct)}%`}</dd>
        <small>
          {kpis.planned_sessions
            ? `Заплановано ${kpis.planned_sessions} сесій`
            : 'Немає активних призначень'}
        </small>
      </div>
      <div className="history-kpi">
        <dt>Середній біль</dt>
        <dd>{kpis.avg_pain === null ? '—' : `${formatNumber(kpis.avg_pain)} / 10`}</dd>
        <small className={`history-kpi__trend history-kpi__trend--${trend.tone}`}>
          {trend.text}
        </small>
      </div>
      <div className="history-kpi">
        <dt>Оцінка техніки</dt>
        <dd>{kpis.avg_score === null ? '—' : `${formatNumber(kpis.avg_score)} / 10`}</dd>
        <small>
          {kpis.avg_score === null ? 'З’явиться після аналізу відео' : 'Середня за період'}
        </small>
      </div>
    </dl>
  )
}
