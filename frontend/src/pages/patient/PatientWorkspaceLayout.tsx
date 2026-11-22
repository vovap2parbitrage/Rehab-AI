import { Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { PatientWorkspaceProvider } from '../../lib/patientWorkspace'

export function PatientWorkspaceLayout() {
  const { tokenParsed } = useAuth()

  return (
    <PatientWorkspaceProvider key={tokenParsed?.sub}>
      <div className="patient-workspace">
        <Outlet />
      </div>
    </PatientWorkspaceProvider>
  )
}
