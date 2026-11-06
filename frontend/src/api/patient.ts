import { apiRequest } from './client'

export interface PatientDoctor {
  id: string
  email: string
}

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked'

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
  created_at: string
}

export interface PatientAssignment {
  id: string
  patient_id: string
  exercise_id: string
  repetitions: number
  sessions_per_week: number
  starts_on: string
  ends_on: string | null
  status: string
  exercise: PatientExercise
  sessions: PatientSession[]
}

export function listPatientDoctors(options: { signal?: AbortSignal } = {}) {
  return apiRequest<PatientDoctor[]>('/api/v1/patient-workspace/doctors', {
    method: 'GET',
    signal: options.signal,
  })
}

export function listPatientInvitations(options: { signal?: AbortSignal } = {}) {
  return apiRequest<PatientInvitation[]>('/api/v1/patient-workspace/invitations', {
    method: 'GET',
    signal: options.signal,
  })
}

export function respondToPatientInvitation(
  invitationId: string,
  status: 'accepted' | 'declined',
) {
  return apiRequest<PatientInvitation>(
    `/api/v1/patient-workspace/invitations/${encodeURIComponent(invitationId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  )
}

export function listPatientAssignments(options: { signal?: AbortSignal } = {}) {
  return apiRequest<PatientAssignment[]>('/api/v1/patient-workspace/assignments', {
    method: 'GET',
    signal: options.signal,
  })
}

export function completePatientAssignment(
  assignmentId: string,
  payload: { pain_score?: number },
) {
  return apiRequest<PatientSession>(
    `/api/v1/patient-workspace/assignments/${encodeURIComponent(assignmentId)}/sessions`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}
