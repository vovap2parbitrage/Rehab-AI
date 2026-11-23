import { apiRequest, type RequestOptions } from './client'
import { pageQuery, type Page, type PageRequestOptions } from './pagination'
import type { AssignmentStatus, InvitationStatus } from './statuses'

export interface Patient {
  id: string
  user_id: string
  therapist_ids: string[]
  first_name: string
  last_name: string
  date_of_birth: string | null
  notes: string | null
  archived_at: string | null
}

export interface Exercise {
  id: string
  name: string
  description: string | null
  reference_video_key: string | null
  joint_tolerances: Record<string, number>
  body_parts: string[]
  created_by: string
  /** Number of the current version: it grows when the video, body parts or tolerances change. */
  version: number
  /** Active assignments of this exercise. */
  active_assignments: number
}

export interface Assignment {
  id: string
  patient_id: string
  exercise_id: string
  duration_weeks: number
  weekdays: number[]
  repetitions: number
  starts_on: string
  status: AssignmentStatus
}

export interface Invitation {
  id: string
  patient_id: string
  therapist_id: string
  status: InvitationStatus
  message: string | null
  created_at: string | null
  responded_at: string | null
}

export interface ExercisePayload {
  name: string
  description: string | null
  reference_video_key: string | null
  joint_tolerances: Record<string, number>
  body_parts: string[]
  /** On an edit: move the active assignments to the new version (default: they stay on theirs). */
  apply_to_active_assignments?: boolean
}

export interface AssignmentPayload {
  patient_id: string
  exercise_id: string
  duration_weeks: number
  weekdays: number[]
  repetitions: number
  starts_on: string
}

export function listPatients(options: PageRequestOptions = {}): Promise<Page<Patient>> {
  return apiRequest<Page<Patient>>(`/api/v1/patients/?${pageQuery(options)}`, options)
}

export function listArchivedPatients(options: PageRequestOptions = {}): Promise<Page<Patient>> {
  return apiRequest<Page<Patient>>(`/api/v1/patients/?archived=true&${pageQuery(options)}`, options)
}

export function archivePatient(id: string): Promise<void> {
  return apiRequest<void>(`/api/v1/patients/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
  })
}

export function restorePatient(id: string): Promise<void> {
  return apiRequest<void>(`/api/v1/patients/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
  })
}

export function getPatient(id: string, options: RequestOptions = {}): Promise<Patient> {
  return apiRequest<Patient>(`/api/v1/patients/${encodeURIComponent(id)}`, options)
}

export function sendInvitation(email: string, message?: string): Promise<Invitation> {
  return apiRequest<Invitation>('/api/v1/invitations/', {
    method: 'POST',
    body: JSON.stringify({ email, message: message || null }),
  })
}

export function listExercises(options: PageRequestOptions = {}): Promise<Page<Exercise>> {
  return apiRequest<Page<Exercise>>(`/api/v1/exercises/?${pageQuery(options)}`, options)
}

export async function listAllExercises(options: RequestOptions = {}): Promise<Exercise[]> {
  const items: Exercise[] = []
  let offset = 0
  let total = 0
  while (offset === 0 || offset < total) {
    const page = await listExercises({ ...options, limit: 100, offset })
    items.push(...page.items)
    total = page.total
    if (page.items.length === 0) break
    offset += page.items.length
  }
  return items
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

export function listAssignments(
  patientId: string,
  options: RequestOptions = {},
): Promise<Assignment[]> {
  return apiRequest<Assignment[]>(
    `/api/v1/assignments/?patient_id=${encodeURIComponent(patientId)}`,
    options,
  )
}

export function createAssignment(payload: AssignmentPayload): Promise<Assignment> {
  return apiRequest<Assignment>('/api/v1/assignments/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function cancelAssignment(assignmentId: string): Promise<void> {
  return apiRequest<void>(`/api/v1/assignments/${assignmentId}/cancel`, {
    method: 'POST',
  })
}

/** What a doctor can change in an assignment. The start date is fixed. */
export interface AssignmentUpdatePayload {
  duration_weeks?: number
  weekdays?: number[]
  repetitions?: number
}

export function updateAssignment(
  assignmentId: string,
  payload: AssignmentUpdatePayload,
): Promise<Assignment> {
  return apiRequest<Assignment>(`/api/v1/assignments/${assignmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}
