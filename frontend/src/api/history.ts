import { apiRequest } from './client'

export type HistoryPeriod = '30d' | '90d' | 'all'

export interface HistoryKpis {
  total_sessions: number
  planned_sessions: number
  adherence_pct: number | null
  avg_pain: number | null
  pain_trend: number | null
  avg_score: number | null
  last_session_at: string | null
}

export interface HistoryPoint {
  session_id: string
  completed_at: string
  value: number
  assignment_id: string
  exercise_name: string
}

export interface AdherenceWeek {
  week_start: string
  completed: number
  planned: number
}

export interface PatientHistory {
  patient_id: string
  period: HistoryPeriod
  date_from: string
  date_to: string
  kpis: HistoryKpis
  pain_series: HistoryPoint[]
  score_series: HistoryPoint[]
  adherence_weeks: AdherenceWeek[]
}

export function getMyHistory(period: HistoryPeriod, signal?: AbortSignal) {
  return apiRequest<PatientHistory>(
    `/api/v1/patients/me/history?period=${encodeURIComponent(period)}`,
    { signal },
  )
}

export function getPatientHistory(patientId: string, period: HistoryPeriod, signal?: AbortSignal) {
  return apiRequest<PatientHistory>(
    `/api/v1/patients/${encodeURIComponent(patientId)}/history?period=${encodeURIComponent(period)}`,
    { signal },
  )
}
