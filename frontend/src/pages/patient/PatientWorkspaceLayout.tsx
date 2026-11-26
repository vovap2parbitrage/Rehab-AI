import { Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { PatientWorkspaceProvider } from '../../lib/patientWorkspace'

export function PatientWorkspaceLayout() {
  const { user } = useAuth()

  return (
    <PatientWorkspaceProvider key={user?.id}>
      <div className="patient-workspace">
        <Outlet />
      </div>
    </PatientWorkspaceProvider>
  )
}
