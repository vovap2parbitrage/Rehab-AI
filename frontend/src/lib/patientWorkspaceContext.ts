import { createContext } from 'react'
import type {
  PatientAssignment,
  PatientTherapist,
  PatientInvitation,
  PatientSession,
} from '../api/patient'
import type { HelpRequest } from '../api/helpRequests'
import type { CachedResource } from './useCachedResource'

export interface PatientWorkspaceResources {
  therapists: CachedResource<PatientTherapist[]>
  invitations: CachedResource<PatientInvitation[]>
  assignments: CachedResource<PatientAssignment[]>
  helpRequests: CachedResource<HelpRequest[]>
}

export type PatientActionResource = 'invitations' | 'assignments'

export interface PatientWorkspaceContextValue extends PatientWorkspaceResources {
  actionPending: string | null
  actionError: { resource: PatientActionResource; message: string } | null
  clearActionError: (resource: PatientActionResource) => void
  respondToInvitation: (invitationId: string, status: 'accepted' | 'declined') => void
  completeAssignment: (
    assignmentId: string,
    painScore: number | null,
  ) => Promise<PatientSession | null>
  askForHelp: (sessionId: string, message: string) => Promise<boolean>
}

export const PatientWorkspaceContext = createContext<PatientWorkspaceContextValue | null>(null)
