import { ErrorMessage } from '../../components/ErrorMessage'
import type { PatientWorkspaceResources } from '../../lib/patientWorkspaceContext'
import { usePatientWorkspace } from '../../lib/usePatientWorkspace'

export function WorkspaceError({ resource }: { resource: keyof PatientWorkspaceResources }) {
  const workspace = usePatientWorkspace()
  const { error: loadError, load } = workspace[resource]
  const actionError = workspace.actionError?.resource === resource ? workspace.actionError.message : null
  const error = actionError ?? loadError
  if (!error) return null

  const retry = () => {
    if (resource === 'invitations' || resource === 'assignments') {
      workspace.clearActionError(resource)
    }
    void load({ refresh: true })
  }

  return <ErrorMessage message={error} onRetry={retry} />
}
