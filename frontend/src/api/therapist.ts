import { apiRequest } from './client'

export interface Patient {
  id: string
  user_id: string
  therapist_ids: string[]
  first_name: string
  last_name: string
  date_of_birth: string | null
  notes: string | null
}

export interface Exercise {
  id: string
  name: string
  description: string | null
  reference_video_key: string | null
  joint_tolerances: Record<string, number>
  created_by: string
}

export interface Assignment {
  id: string
  patient_id: string
  exercise_id: string
  sessions_per_week: number
  repetitions: number
  starts_on: string
  ends_on: string | null
  status: string
}

export interface Invitation {
  id: string
  patient_id: string
  therapist_id: string
  status: string
  message: string | null
  created_at: string | null
  responded_at: string | null
}

export interface ExercisePayload {
  name: string
  description: string | null
  reference_video_key: string | null
  joint_tolerances: Record<string, number>
}

export interface AssignmentPayload {
  patient_id: string
  exercise_id: string
  sessions_per_week: number
  repetitions: number
  starts_on: string
  ends_on: string | null
}

export function listPatients(signal?: AbortSignal): Promise<Patient[]> {
  return apiRequest<Patient[]>('/api/v1/patients/', { signal })
}

export function sendInvitation(email: string, message?: string): Promise<Invitation> {
  return apiRequest<Invitation>('/api/v1/invitations/', {
    method: 'POST',
    body: JSON.stringify({ email, message: message || null }),
  })
}

export function listExercises(signal?: AbortSignal): Promise<Exercise[]> {
  return apiRequest<Exercise[]>('/api/v1/exercises/', { signal })
}

export function createExercise(payload: ExercisePayload): Promise<Exercise> {
  return apiRequest<Exercise>('/api/v1/exercises/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateExercise(id: string, payload: ExercisePayload): Promise<Exercise> {
  return apiRequest<Exercise>(`/api/v1/exercises/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteExercise(id: string): Promise<void> {
  return apiRequest<void>(`/api/v1/exercises/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function listAssignments(patientId: string, signal?: AbortSignal): Promise<Assignment[]> {
  return apiRequest<Assignment[]>(
    `/api/v1/assignments/?patient_id=${encodeURIComponent(patientId)}`,
    { signal },
  )
}

export function createAssignment(payload: AssignmentPayload): Promise<Assignment> {
  return apiRequest<Assignment>('/api/v1/assignments/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
