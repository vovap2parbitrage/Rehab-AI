import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  completePatientAssignment,
  listPatientAssignments,
  listPatientTherapists,
  listPatientInvitations,
  respondToPatientInvitation,
  type PatientAssignment,
  type PatientTherapist,
  type PatientInvitation,
  type PatientSession,
} from '../api/patient'
import { createHelpRequest, listMyHelpRequests, type HelpRequest } from '../api/helpRequests'
import { useAuth } from '../auth/useAuth'
import { getErrorMessage } from './errorMessage'
import { PatientWorkspaceContext } from './patientWorkspaceContext'

export function PatientWorkspaceProvider({ children }: { children: ReactNode }) {
  const { authenticated, initialized } = useAuth()
  const [therapists, setTherapists] = useState<PatientTherapist[]>([])
  const [invitations, setInvitations] = useState<PatientInvitation[]>([])
  const [assignments, setAssignments] = useState<PatientAssignment[]>([])
  const [helpRequests, setHelpRequests] = useState<HelpRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadWorkspace = useCallback(async (signal?: AbortSignal) => {
    try {
      const [invitationsResult, assignmentsResult, helpRequestsResult] = await Promise.allSettled([
        listPatientInvitations({ signal }),
        listPatientAssignments({ signal }),
        listMyHelpRequests({ signal }),
      ])
      if (signal?.aborted) return

      const failures: string[] = []
      const invitations =
        invitationsResult.status === 'fulfilled' ? invitationsResult.value : []
      const assignments =
        assignmentsResult.status === 'fulfilled' ? assignmentsResult.value : []
      const patientId = invitations[0]?.patient_id ?? assignments[0]?.patient_id

      if (invitationsResult.status === 'fulfilled') {
        setInvitations(invitations)
      } else {
        failures.push(getErrorMessage(invitationsResult.reason, 'Не вдалося завантажити дані кабінету пацієнта.'))
      }
      if (assignmentsResult.status === 'fulfilled') {
        setAssignments(assignments)
      } else {
        failures.push(getErrorMessage(assignmentsResult.reason, 'Не вдалося завантажити дані кабінету пацієнта.'))
      }
      if (helpRequestsResult.status === 'fulfilled') {
        setHelpRequests(helpRequestsResult.value)
      } else {
        failures.push(getErrorMessage(helpRequestsResult.reason, 'Не вдалося завантажити дані кабінету пацієнта.'))
      }

      if (patientId) {
        try {
          const therapists = await listPatientTherapists(patientId, { signal })
          const emails = new Map(
            invitations.map((invitation) => [invitation.therapist_id, invitation.therapist_email]),
          )
          setTherapists(
            therapists.map((therapist) => ({
              id: therapist.id,
              email: emails.get(therapist.id) ?? therapist.id,
            })),
          )
        } catch (caught) {
          failures.push(getErrorMessage(caught, 'Не вдалося завантажити дані кабінету пацієнта.'))
        }
      } else {
        setTherapists([])
      }
      setError(failures[0] ?? null)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!initialized || !authenticated) return
    const controller = new AbortController()
    queueMicrotask(() => {
      void loadWorkspace(controller.signal)
    })
    return () => controller.abort()
  }, [authenticated, initialized, loadWorkspace])

  const refresh = useCallback(() => {
    setLoading(true)
    setError(null)
    void loadWorkspace()
  }, [loadWorkspace])

  const reload = useCallback(() => loadWorkspace(), [loadWorkspace])

  const respond = useCallback(
    async (invitationId: string, status: 'accepted' | 'declined') => {
      setActionPending(invitationId)
      setError(null)
      try {
        const updated = await respondToPatientInvitation(invitationId, status)
        setInvitations((current) =>
          current.map((invitation) => (invitation.id === updated.id ? updated : invitation)),
        )
        await loadWorkspace()
      } catch (caught) {
        setError(getErrorMessage(caught, 'Не вдалося завантажити дані кабінету пацієнта.'))
      } finally {
        setActionPending(null)
      }
    },
    [loadWorkspace],
  )

  const complete = useCallback(
    async (assignmentId: string, painScore: number | null) => {
      setActionPending(assignmentId)
      setError(null)
      try {
        const session: PatientSession = await completePatientAssignment(assignmentId, {
          ...(painScore === null ? {} : { pain_score: painScore }),
        })
        setAssignments((current) =>
          current.map((assignment) =>
            assignment.id === assignmentId
              ? { ...assignment, sessions: [...assignment.sessions, session] }
              : assignment,
          ),
        )
        return session
      } catch (caught) {
        setError(getErrorMessage(caught, 'Не вдалося завантажити дані кабінету пацієнта.'))
        return null
      } finally {
        setActionPending(null)
      }
    },
    [],
  )

  const askForHelp = useCallback(async (sessionId: string, message: string) => {
    setActionPending(sessionId)
    setError(null)
    try {
      const created = await createHelpRequest(sessionId, message)
      setHelpRequests((current) => [created, ...current])
      return true
    } catch (caught) {
      setError(getErrorMessage(caught, 'Не вдалося завантажити дані кабінету пацієнта.'))
      return false
    } finally {
      setActionPending(null)
    }
  }, [])

  const value = useMemo(
    () => ({
      therapists,
      invitations,
      assignments,
      helpRequests,
      loading,
      actionPending,
      error,
      refresh,
      reload,
      respondToInvitation: respond,
      completeAssignment: complete,
      askForHelp,
    }),
    [
      therapists,
      invitations,
      assignments,
      helpRequests,
      loading,
      actionPending,
      error,
      refresh,
      reload,
      respond,
      complete,
      askForHelp,
    ],
  )

  return <PatientWorkspaceContext.Provider value={value}>{children}</PatientWorkspaceContext.Provider>
}
