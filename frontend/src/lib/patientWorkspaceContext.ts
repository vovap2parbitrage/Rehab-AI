import { createContext } from 'react'
import type {
  PatientAssignment,
  PatientDoctor,
  PatientInvitation,
} from '../api/patient'

export interface PatientWorkspaceContextValue {
  doctors: PatientDoctor[]
  invitations: PatientInvitation[]
  assignments: PatientAssignment[]
  loading: boolean
  actionPending: string | null
  error: string | null
  refresh: () => void
  respondToInvitation: (invitationId: string, status: 'accepted' | 'declined') => void
  completeAssignment: (assignmentId: string, painScore: number | null) => Promise<boolean>
}

export const PatientWorkspaceContext =
  createContext<PatientWorkspaceContextValue | null>(null)
