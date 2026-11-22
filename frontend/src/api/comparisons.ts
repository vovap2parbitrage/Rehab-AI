import { apiRequest, type RequestOptions } from './client'

export type ComparisonStatus = 'pending' | 'done' | 'rerecord' | 'no_repetitions' | 'failed'

export interface ErrorSegment {
  joint: string
  start_s: number
  end_s: number
  peak_deviation_deg: number
  direction: string
}

export interface ComparisonResult {
  task_id: string
  status: ComparisonStatus
  score: number | null
  worst_repetition_score: number | null
  repetitions: number | null
  repetition_scores: number[] | null
  joint_scores: Record<string, number> | null
  errors: ErrorSegment[] | null
  message: string | null
  session_id: string | null
}

export interface ComparisonPayload {
  assignment_id: string
  patient_key: string
  pain_score: number | null
}

/** Queues the analysis of an uploaded video for an assignment. */
export function startComparison(payload: ComparisonPayload): Promise<{ task_id: string }> {
  const { pain_score, ...rest } = payload
  return apiRequest<{ task_id: string }>('/api/v1/comparisons', {
    method: 'POST',
    body: JSON.stringify(pain_score === null ? rest : { ...rest, pain_score }),
  })
}

export function getComparison(taskId: string, options: RequestOptions = {}): Promise<ComparisonResult> {
  return apiRequest<ComparisonResult>(`/api/v1/comparisons/${encodeURIComponent(taskId)}`, options)
}
