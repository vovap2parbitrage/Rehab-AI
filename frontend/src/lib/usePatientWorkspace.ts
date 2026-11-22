import { useContext, useEffect } from 'react'
import { useAuth } from '../auth/useAuth'
import { PatientWorkspaceContext, type PatientWorkspaceResources } from './patientWorkspaceContext'

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
  const { idle, load } = resource

  useEffect(() => {
    if (!initialized || !authenticated || !idle) return

    // Start after the provider's effects, including when Strict Mode remounts them.
    let active = true
    queueMicrotask(() => {
      if (active) void load()
    })
    return () => {
      active = false
    }
  }, [authenticated, initialized, idle, load])

  return resource
}
