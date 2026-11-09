import { createContext } from 'react'
import type {
  PatientAssignment,
  PatientTherapist,
  PatientInvitation,
  PatientSession,
} from '../api/patient'
import type { HelpRequest } from '../api/helpRequests'

export interface PatientWorkspaceContextValue {
  therapists: PatientTherapist[]
  invitations: PatientInvitation[]
  assignments: PatientAssignment[]
  helpRequests: HelpRequest[]
  loading: boolean
  actionPending: string | null
  error: string | null
  refresh: () => void
  respondToInvitation: (invitationId: string, status: 'accepted' | 'declined') => void
  completeAssignment: (assignmentId: string, painScore: number | null) => Promise<PatientSession | null>
  askForHelp: (sessionId: string, message: string) => Promise<boolean>
}

export const PatientWorkspaceContext =
  createContext<PatientWorkspaceContextValue | null>(null)
