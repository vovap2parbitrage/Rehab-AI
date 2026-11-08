import type { ReactNode } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { AdherenceWeek, HistoryPoint, PatientHistory } from '../../api/history'
import { formatDateTime, formatShortDate, formatWeek } from './format'

const CHART_HEIGHT = 240
const AXIS_TICK = { fill: '#6b7f92', fontSize: 12 }
const GRID_COLOR = '#dbe7ef'

interface ChartCardProps {
  title: string
  description: string
  empty: boolean
  emptyText: string
  children: ReactNode
}

function ChartCard({ title, description, empty, emptyText, children }: ChartCardProps) {
  return (
    <figure className="history-chart">
      <figcaption>
        <h3>{title}</h3>
        <p>{description}</p>
      </figcaption>
      {empty ? <p className="history-chart__empty">{emptyText}</p> : children}
    </figure>
  )
}

interface SeriesDatum {
  time: number
  value: number
  exercise: string
}

function SeriesTooltip({
  active,
  payload,
  unit,
}: TooltipContentProps & { unit: string }) {
  const datum = payload?.[0]?.payload as SeriesDatum | undefined
  if (!active || !datum) return null

  return (
    <div className="history-tooltip">
      <strong>
        {datum.value} {unit}
      </strong>
      <span>{datum.exercise}</span>
      <small>{formatDateTime(datum.time)}</small>
    </div>
  )
}

interface TimeSeriesChartProps {
  points: HistoryPoint[]
  max: number
  unit: string
  color: string
  label: string
}

function TimeSeriesChart({ points, max, unit, color, label }: TimeSeriesChartProps) {
  const data: SeriesDatum[] = points.map((point) => ({
    time: new Date(point.completed_at).getTime(),
    value: point.value,
    exercise: point.exercise_name,
  }))

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="time"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          padding={{ left: 12, right: 12 }}
          tickFormatter={formatShortDate}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: GRID_COLOR }}
          minTickGap={24}
        />
        <YAxis
          domain={[0, max]}
          allowDecimals={false}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={(props) => <SeriesTooltip {...props} unit={unit} />} />
        <Line
          type="monotone"
          dataKey="value"
          name={label}
          stroke={color}
          strokeWidth={2.5}
          dot={{ r: 3.5, fill: color }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function PainChart({ points }: { points: HistoryPoint[] }) {
  return (
    <ChartCard
      title="Рівень болю"
      description="Оцінка болю після кожної сесії, 0–10"
      empty={points.length === 0}
      emptyText="Немає сесій з оцінкою болю за цей період."
    >
      <TimeSeriesChart points={points} max={10} unit="/ 10" color="#b42318" label="Біль" />
    </ChartCard>
  )
}

export function ScoreChart({ points }: { points: HistoryPoint[] }) {
  return (
    <ChartCard
      title="Оцінка техніки"
      description="Результат аналізу відео, 0–100"
      empty={points.length === 0}
      emptyText="Оцінка техніки з’явиться після аналізу відео."
    >
      <TimeSeriesChart points={points} max={100} unit="/ 100" color="#1266a6" label="Оцінка" />
    </ChartCard>
  )
}

function AdherenceTooltip({ active, payload }: TooltipContentProps) {
  const week = payload?.[0]?.payload as AdherenceWeek | undefined
  if (!active || !week) return null

  return (
    <div className="history-tooltip">
      <strong>Тиждень {formatWeek(week.week_start)}</strong>
      <span>Виконано: {week.completed}</span>
      <span>За планом: {week.planned}</span>
    </div>
  )
}

export function AdherenceChart({ weeks }: { weeks: AdherenceWeek[] }) {
  const empty = weeks.every((week) => week.completed === 0 && week.planned === 0)

  return (
    <ChartCard
      title="Регулярність"
      description="Виконані сесії за тиждень порівняно з планом"
      empty={empty}
      emptyText="За цей період немає ні призначень, ні виконаних сесій."
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ComposedChart data={weeks} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="week_start"
            tickFormatter={(value: string) => formatShortDate(`${value}T00:00:00`)}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: GRID_COLOR }}
            minTickGap={16}
          />
          <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <Tooltip content={AdherenceTooltip} cursor={{ fill: 'rgba(18, 102, 166, 0.06)' }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="completed"
            name="Виконано"
            fill="#0e9f8f"
            radius={[6, 6, 0, 0]}
            maxBarSize={36}
            isAnimationActive={false}
          />
          <Line
            type="stepAfter"
            dataKey="planned"
            name="План"
            stroke="#1266a6"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

export default function HistoryCharts({ history }: { history: PatientHistory }) {
  return (
    <div className="history-charts">
      <PainChart points={history.pain_series} />
      <AdherenceChart weeks={history.adherence_weeks} />
      <ScoreChart points={history.score_series} />
    </div>
  )
}
