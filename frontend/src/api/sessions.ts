import { apiRequest } from './client'

/** Temporary link for playing the video a session was recorded from. */
export async function getSessionVideoUrl(sessionId: string): Promise<string> {
  const response = await apiRequest<{ url: string }>(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/video`,
  )
  return response.url
}
