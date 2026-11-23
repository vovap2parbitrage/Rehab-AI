import type { PatientSession } from './patient'
import { apiRequest, type RequestOptions } from './client'
import { pageQuery, type Page, type PageRequestOptions } from './pagination'

/** Temporary link for playing the video a session was recorded from. */
export async function getSessionVideoUrl(sessionId: string): Promise<string> {
  const response = await apiRequest<{ url: string }>(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/video`,
  )
  return response.url
}

export interface VideoDuplicateCheckResult {
  session_date: string | null
}

/** Finds this patient's most recent saved session with identical video bytes. */
export function checkVideoDuplicate(
  videoSha256: string,
  options: RequestOptions = {},
): Promise<VideoDuplicateCheckResult> {
  return apiRequest<VideoDuplicateCheckResult>('/api/v1/sessions/duplicate-video', {
    method: 'POST',
    body: JSON.stringify({ video_sha256: videoSha256 }),
    signal: options.signal,
  })
}

/** All sessions of one patient (for the patient's therapists and admins). */
export function listPatientSessions(
  patientId: string,
  options: PageRequestOptions = {},
): Promise<Page<PatientSession>> {
  const params = new URLSearchParams(pageQuery(options))
  params.set('patient_id', patientId)
  return apiRequest<Page<PatientSession>>(`/api/v1/sessions/?${params}`, options)
}
