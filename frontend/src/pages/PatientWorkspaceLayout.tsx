import { Outlet } from 'react-router-dom'
import { usePatientWorkspace } from '../lib/patientWorkspace'

export function PatientWorkspaceLayout() {
  const { storageError } = usePatientWorkspace()

  return (
    <div className="patient-workspace">
      {storageError && (
        <p className="workspace-storage-error" role="status">
          {storageError}
        </p>
      )}

      <Outlet />
    </div>
  )
}
