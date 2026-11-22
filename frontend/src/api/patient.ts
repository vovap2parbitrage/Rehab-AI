import { apiRequest, type RequestOptions } from './client'
import type { AssignmentStatus, InvitationStatus } from './statuses'

export interface PatientTherapist {
  id: string
  role: string
}

export interface PatientInvitation {
  id: string
  patient_id: string
  therapist_id: string
  therapist_email: string
  status: InvitationStatus
  message: string | null
  created_at: string
  responded_at: string | null
}

export interface PatientExercise {
  id: string
  name: string
  description: string | null
  reference_video_key: string | null
}

export interface PatientSession {
  id: string
  assignment_id: string
  pain_score: number | null
  completed_at: string | null
  score: number | null
  joint_deviations: Record<string, unknown>
  has_video: boolean
  created_at: string
}

export interface PatientAssignment {
  id: string
  patient_id: string
  exercise_id: string
  repetitions: number
  duration_weeks: number
  weekdays: number[]
  starts_on: string
  status: AssignmentStatus
  exercise: PatientExercise
  sessions: PatientSession[]
}

export function listPatientTherapists(
  patientId: string,
  options: RequestOptions = {},
): Promise<PatientTherapist[]> {
  return apiRequest<PatientTherapist[]>(
    `/api/v1/patients/${encodeURIComponent(patientId)}/therapists`,
    options,
  )
}

export function listPatientInvitations(options: RequestOptions = {}): Promise<PatientInvitation[]> {
  return apiRequest<PatientInvitation[]>('/api/v1/invitations/mine', options)
}

export function respondToPatientInvitation(
  invitationId: string,
  status: 'accepted' | 'declined',
) {
  return apiRequest<PatientInvitation>(
    `/api/v1/invitations/${encodeURIComponent(invitationId)}/response`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  )
}

export function listPatientAssignments(options: RequestOptions = {}): Promise<PatientAssignment[]> {
  return apiRequest<PatientAssignment[]>('/api/v1/assignments/mine', options)
}

export function completePatientAssignment(
  assignmentId: string,
  payload: { pain_score?: number },
) {
  return apiRequest<PatientSession>(
    `/api/v1/sessions/assignments/${encodeURIComponent(assignmentId)}`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}
