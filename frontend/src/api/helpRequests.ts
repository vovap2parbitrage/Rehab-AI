import { apiRequest, type RequestOptions } from './client'
import { pageQuery, type Page, type PageRequestOptions } from './pagination'

export interface HelpRequest {
  id: string
  session_id: string
  assignment_id: string
  patient_id: string
  patient_name: string
  exercise_name: string
  pain_score: number | null
  /** How the session the question is about was scored and recorded. */
  score: number | null
  has_video: boolean
  joint_deviations: Record<string, unknown>
  message: string
  reply: string | null
  replied_by_email: string | null
  created_at: string
  replied_at: string | null
}

/** Patient: ask the therapist for help about a completed session. */
export function createHelpRequest(sessionId: string, message: string): Promise<HelpRequest> {
  return apiRequest<HelpRequest>('/api/v1/help-requests/', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, message }),
  })
}

/** Patient: own questions together with the therapist's replies. */
export function listMyHelpRequests(options: RequestOptions = {}): Promise<HelpRequest[]> {
  return apiRequest<HelpRequest[]>('/api/v1/help-requests/mine', options)
}

/** Therapist: unanswered questions of their patients ("Needs attention"). */
export function listNeedsAttention(options: PageRequestOptions = {}): Promise<Page<HelpRequest>> {
  return apiRequest<Page<HelpRequest>>(
    `/api/v1/help-requests/needs-attention?${pageQuery(options)}`,
    options,
  )
}

/** Therapist: all questions of one patient with replies, newest first. */
export function listPatientHelpRequests(
  patientId: string,
  options: PageRequestOptions = {},
): Promise<Page<HelpRequest>> {
  const params = new URLSearchParams(pageQuery(options))
  params.set('patient_id', patientId)
  return apiRequest<Page<HelpRequest>>(`/api/v1/help-requests/?${params}`, options)
}

/** Therapist: answer a patient's question; it then leaves the "Needs attention" list. */
export function replyToHelpRequest(id: string, reply: string): Promise<HelpRequest> {
  return apiRequest<HelpRequest>(`/api/v1/help-requests/${encodeURIComponent(id)}/reply`, {
    method: 'PATCH',
    body: JSON.stringify({ reply }),
  })
}
