import { apiRequest, type RequestOptions } from './client'

export interface HelpRequest {
  id: string
  session_id: string
  assignment_id: string
  patient_id: string
  patient_name: string
  exercise_name: string
  pain_score: number | null
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
export function listNeedsAttention(options: RequestOptions = {}): Promise<HelpRequest[]> {
  return apiRequest<HelpRequest[]>('/api/v1/help-requests/needs-attention', options)
}

/** Therapist: all questions of one patient with replies, newest first. */
export function listPatientHelpRequests(
  patientId: string,
  options: RequestOptions = {},
): Promise<HelpRequest[]> {
  return apiRequest<HelpRequest[]>(
    `/api/v1/help-requests/?patient_id=${encodeURIComponent(patientId)}`,
    options,
  )
}

/** Therapist: answer a patient's question; it then leaves the "Needs attention" list. */
export function replyToHelpRequest(id: string, reply: string): Promise<HelpRequest> {
  return apiRequest<HelpRequest>(`/api/v1/help-requests/${encodeURIComponent(id)}/reply`, {
    method: 'PATCH',
    body: JSON.stringify({ reply }),
  })
}
