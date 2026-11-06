import { useContext } from 'react'
import { PatientWorkspaceContext } from './patientWorkspaceContext'

export function usePatientWorkspace() {
  const context = useContext(PatientWorkspaceContext)
  if (!context) {
    throw new Error('usePatientWorkspace must be used inside PatientWorkspaceProvider')
  }
  return context
}
