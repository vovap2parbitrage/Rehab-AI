import type { PatientSession } from './patient'
import { apiRequest, type RequestOptions } from './client'

/** Temporary link for playing the video a session was recorded from. */
export async function getSessionVideoUrl(sessionId: string): Promise<string> {
  const response = await apiRequest<{ url: string }>(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/video`,
  )
  return response.url
}

/** All sessions of one patient (for the patient's therapists and admins). */
export function listPatientSessions(
  patientId: string,
  options: RequestOptions = {},
): Promise<PatientSession[]> {
  return apiRequest<PatientSession[]>(
    `/api/v1/sessions/?patient_id=${encodeURIComponent(patientId)}`,
    { signal: options.signal },
  )
}
