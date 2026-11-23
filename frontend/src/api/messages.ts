import { apiRequest, type RequestOptions } from './client'

/** A message from a therapist to a patient, with the patient's one answer. */
export interface TherapistMessage {
  id: string
  patient_id: string
  patient_name: string
  therapist_name: string
  message: string
  created_at: string
  reply: string | null
  replied_at: string | null
  /** False while the therapist has not looked at the reply yet. */
  reply_seen: boolean
}

/** Therapist: write to one of their patients. */
export function sendMessage(patientId: string, message: string): Promise<TherapistMessage> {
  return apiRequest<TherapistMessage>('/api/v1/messages/', {
    method: 'POST',
    body: JSON.stringify({ patient_id: patientId, message }),
  })
}

/** Therapist: the messages they sent, newest first, with the replies. */
export function listSentMessages(options: RequestOptions = {}): Promise<TherapistMessage[]> {
  return apiRequest<TherapistMessage[]>('/api/v1/messages/', options)
}

export function markReplySeen(id: string): Promise<void> {
  return apiRequest<void>(`/api/v1/messages/${encodeURIComponent(id)}/seen`, { method: 'POST' })
}

/** Patient: the messages their therapists sent them, newest first. */
export function listMyMessages(options: RequestOptions = {}): Promise<TherapistMessage[]> {
  return apiRequest<TherapistMessage[]>('/api/v1/messages/mine', options)
}

export function replyToMessage(id: string, reply: string): Promise<TherapistMessage> {
  return apiRequest<TherapistMessage>(`/api/v1/messages/${encodeURIComponent(id)}/reply`, {
    method: 'POST',
    body: JSON.stringify({ reply }),
  })
}
