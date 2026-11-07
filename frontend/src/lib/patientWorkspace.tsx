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
  listPatientDoctors,
  listPatientInvitations,
  respondToPatientInvitation,
  type PatientAssignment,
  type PatientDoctor,
  type PatientInvitation,
  type PatientSession,
} from '../api/patient'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { PatientWorkspaceContext } from './patientWorkspaceContext'

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message
  if (error instanceof Error) return error.message
  return 'Не вдалося завантажити дані кабінету пацієнта.'
}

export function PatientWorkspaceProvider({ children }: { children: ReactNode }) {
  const { authenticated, initialized } = useAuth()
  const [doctors, setDoctors] = useState<PatientDoctor[]>([])
  const [invitations, setInvitations] = useState<PatientInvitation[]>([])
  const [assignments, setAssignments] = useState<PatientAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadWorkspace = useCallback(async (signal?: AbortSignal) => {
    try {
      const [invitationsResult, assignmentsResult] = await Promise.allSettled([
        listPatientInvitations({ signal }),
        listPatientAssignments({ signal }),
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
        failures.push(getErrorMessage(invitationsResult.reason))
      }
      if (assignmentsResult.status === 'fulfilled') {
        setAssignments(assignments)
      } else {
        failures.push(getErrorMessage(assignmentsResult.reason))
      }

      if (patientId) {
        try {
          const therapists = await listPatientDoctors(patientId, { signal })
          const emails = new Map(
            invitations.map((invitation) => [invitation.therapist_id, invitation.therapist_email]),
          )
          setDoctors(
            therapists.map((therapist) => ({
              id: therapist.id,
              email: emails.get(therapist.id) ?? therapist.id,
            })),
          )
        } catch (caught) {
          failures.push(getErrorMessage(caught))
        }
      } else {
        setDoctors([])
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
        setError(getErrorMessage(caught))
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
        return true
      } catch (caught) {
        setError(getErrorMessage(caught))
        return false
      } finally {
        setActionPending(null)
      }
    },
    [],
  )

  const value = useMemo(
    () => ({
      doctors,
      invitations,
      assignments,
      loading,
      actionPending,
      error,
      refresh,
      respondToInvitation: respond,
      completeAssignment: complete,
    }),
    [
      doctors,
      invitations,
      assignments,
      loading,
      actionPending,
      error,
      refresh,
      respond,
      complete,
    ],
  )

  return <PatientWorkspaceContext.Provider value={value}>{children}</PatientWorkspaceContext.Provider>
}
