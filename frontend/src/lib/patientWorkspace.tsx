import { useCallback, useState, type ReactNode } from 'react'
import { createHelpRequest, listMyHelpRequests } from '../api/helpRequests'
import {
  completePatientAssignment,
  listPatientAssignments,
  listPatientInvitations,
  listPatientTherapists,
  respondToPatientInvitation,
  type PatientTherapist,
} from '../api/patient'
import { getErrorMessage } from './errorMessage'
import { PatientWorkspaceContext, type PatientActionResource } from './patientWorkspaceContext'
import { useCachedResource } from './useCachedResource'

const WORKSPACE_ERROR = 'Не вдалося завантажити дані кабінету пацієнта.'

export function PatientWorkspaceProvider({ children }: { children: ReactNode }) {
  const invitations = useCachedResource(listPatientInvitations, WORKSPACE_ERROR)
  const assignments = useCachedResource(listPatientAssignments, WORKSPACE_ERROR)
  const helpRequests = useCachedResource(listMyHelpRequests, WORKSPACE_ERROR)
  const { load: loadInvitations } = invitations
  const { load: loadAssignments } = assignments

  const fetchTherapists = useCallback(
    async ({ signal }: { signal: AbortSignal }): Promise<PatientTherapist[]> => {
      const patientInvitations = await loadInvitations()
      if (signal.aborted) return []

      let patientId = patientInvitations?.[0]?.patient_id
      if (!patientId) {
        const patientAssignments = await loadAssignments()
        if (signal.aborted) return []
        patientId = patientAssignments?.[0]?.patient_id
        if (!patientId && (!patientInvitations || !patientAssignments)) {
          throw new Error('Не вдалося визначити профіль пацієнта для списку лікарів.')
        }
      }
      return patientId ? listPatientTherapists(patientId, { signal }) : []
    },
    [loadInvitations, loadAssignments],
  )
  const therapists = useCachedResource(fetchTherapists, WORKSPACE_ERROR)

  const [actionPending, setActionPending] = useState<string | null>(null)
  const [actionError, setActionError] = useState<{
    resource: PatientActionResource
    message: string
  } | null>(null)

  const clearActionError = (resource: PatientActionResource) => {
    setActionError((current) => (current?.resource === resource ? null : current))
  }

  const respondToInvitation = async (invitationId: string, status: 'accepted' | 'declined') => {
    setActionPending(invitationId)
    clearActionError('invitations')
    try {
      const updated = await respondToPatientInvitation(invitationId, status)
      invitations.update((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
      therapists.invalidate()
      await loadInvitations({ refresh: true, background: true })
    } catch (caught) {
      setActionError({ resource: 'invitations', message: getErrorMessage(caught, WORKSPACE_ERROR) })
    } finally {
      setActionPending(null)
    }
  }

  const completeAssignment = async (assignmentId: string, painScore: number | null) => {
    setActionPending(assignmentId)
    clearActionError('assignments')
    try {
      const session = await completePatientAssignment(assignmentId, {
        ...(painScore === null ? {} : { pain_score: painScore }),
      })
      assignments.update((current) =>
        current.map((assignment) =>
          assignment.id === assignmentId
            ? { ...assignment, sessions: [...assignment.sessions, session] }
            : assignment,
        ),
      )
      return session
    } catch (caught) {
      setActionError({ resource: 'assignments', message: getErrorMessage(caught, WORKSPACE_ERROR) })
      return null
    } finally {
      setActionPending(null)
    }
  }

  const askForHelp = async (sessionId: string, message: string) => {
    setActionPending(sessionId)
    clearActionError('assignments')
    try {
      const created = await createHelpRequest(sessionId, message)
      helpRequests.update((current) => [created, ...current])
      return true
    } catch (caught) {
      setActionError({ resource: 'assignments', message: getErrorMessage(caught, WORKSPACE_ERROR) })
      return false
    } finally {
      setActionPending(null)
    }
  }

  return (
    <PatientWorkspaceContext.Provider
      value={{
        therapists,
        invitations,
        assignments,
        helpRequests,
        actionPending,
        actionError,
        clearActionError,
        respondToInvitation,
        completeAssignment,
        askForHelp,
      }}
    >
      {children}
    </PatientWorkspaceContext.Provider>
  )
}
