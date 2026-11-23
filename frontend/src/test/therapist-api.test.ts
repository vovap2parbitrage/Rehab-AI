import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '../api/client'
import { listNeedsAttention } from '../api/helpRequests'
import { listExercises, type Exercise } from '../api/therapist'

vi.mock('../api/client', () => ({
  apiRequest: vi.fn(),
}))

const exercise: Exercise = {
  id: 'exercise-1',
  name: 'Присідання',
  description: null,
  reference_video_key: null,
  joint_tolerances: {},
  body_parts: ['right_leg'],
  created_by: 'therapist-1',
  version: 1,
  active_assignments: 0,
}

const helpRequest = {
  id: 'help-1',
  session_id: 'session-1',
  assignment_id: 'assignment-1',
  patient_id: 'patient-1',
  patient_name: 'Пацієнт',
  exercise_name: 'Присідання',
  pain_score: null,
  score: null,
  joint_deviations: {},
  has_video: false,
  message: 'Потрібна порада',
  reply: null,
  replied_by_email: null,
  created_at: '2026-01-01T00:00:00Z',
  replied_at: null,
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('listExercises', () => {
  it('continues to accept the legacy array response', async () => {
    vi.mocked(apiRequest).mockImplementation(async <T>() => [exercise] as T)

    await expect(listExercises()).resolves.toEqual([exercise])
  })

  it('reads every page when the API returns paginated exercises', async () => {
    const secondExercise = { ...exercise, id: 'exercise-2', name: 'Випади' }
    vi.mocked(apiRequest).mockImplementation(async <T>(path: string) => {
      const page = path.endsWith('offset=0')
        ? { items: [exercise], total: 2, limit: 1, offset: 0 }
        : { items: [secondExercise], total: 2, limit: 1, offset: 1 }
      return page as T
    })

    await expect(listExercises()).resolves.toEqual([exercise, secondExercise])
    expect(apiRequest).toHaveBeenNthCalledWith(1, '/api/v1/exercises/?limit=100&offset=0', {})
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/api/v1/exercises/?limit=100&offset=1', {})
  })

  it('normalizes paginated therapist questions to a list', async () => {
    vi.mocked(apiRequest).mockImplementation(
      async <T>() => ({ items: [helpRequest], total: 1, limit: 100, offset: 0 }) as T,
    )

    await expect(listNeedsAttention()).resolves.toEqual([helpRequest])
  })
})
