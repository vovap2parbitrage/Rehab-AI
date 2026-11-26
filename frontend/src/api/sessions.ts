import type { PatientSession } from './patient'
import { apiRequest } from './client'
import { pageQuery, type Page, type PageRequestOptions } from './pagination'

/** Temporary link for playing the video a session was recorded from. */
export async function getSessionVideoUrl(sessionId: string): Promise<string> {
  const response = await apiRequest<{ url: string }>(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/video`,
  )
  return response.url
}

/** All sessions of one patient (visible to that patient and their therapists). */
export function listPatientSessions(
  patientId: string,
  options: PageRequestOptions = {},
): Promise<Page<PatientSession>> {
  const params = new URLSearchParams(pageQuery(options))
  params.set('patient_id', patientId)
  return apiRequest<Page<PatientSession>>(`/api/v1/sessions/?${params}`, options)
}
