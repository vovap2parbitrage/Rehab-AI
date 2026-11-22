import { useContext } from 'react'
import { useAuth } from '../auth/useAuth'
import { PatientWorkspaceContext, type PatientWorkspaceResources } from './patientWorkspaceContext'
import { useRefreshOnEntry } from './useCachedResource'

export function usePatientWorkspace() {
  const context = useContext(PatientWorkspaceContext)
  if (!context) {
    throw new Error('usePatientWorkspace must be used inside PatientWorkspaceProvider')
  }
  return context
}

export function usePatientData<K extends keyof PatientWorkspaceResources>(
  key: K,
): PatientWorkspaceResources[K] {
  const { authenticated, initialized } = useAuth()
  const resource = usePatientWorkspace()[key]
  useRefreshOnEntry(resource, initialized && authenticated)
  return resource
}
