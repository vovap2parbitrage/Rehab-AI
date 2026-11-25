import { apiRequest, type RequestOptions } from './client'
import type { LiveReference } from '../lib/liveRepetitions'

interface LiveReferenceResponse {
  exercise_version_id: string
  joints: string[]
  fps: number
  angles: number[][]
  tolerances: Record<string, number>
  default_tolerance_deg: number
}

/** The reference angles of the assignment's exercise, to judge repetitions while recording. */
export async function getLiveReference(
  assignmentId: string,
  options: RequestOptions = {},
): Promise<LiveReference> {
  const response = await apiRequest<LiveReferenceResponse>(
    `/api/v1/assignments/${encodeURIComponent(assignmentId)}/live-reference`,
    options,
  )
  return {
    joints: response.joints,
    fps: response.fps,
    angles: response.angles,
    tolerances: response.tolerances,
  }
}
