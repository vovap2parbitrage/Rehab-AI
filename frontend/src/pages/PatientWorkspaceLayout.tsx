import { Outlet } from 'react-router-dom'
import { PatientWorkspaceProvider } from '../lib/patientWorkspace'

export function PatientWorkspaceLayout() {
  return (
    <PatientWorkspaceProvider>
      <div className="patient-workspace">
        <Outlet />
      </div>
    </PatientWorkspaceProvider>
  )
}
