import { Outlet } from 'react-router-dom'
import { listExercises, listPatients, type Exercise, type Patient } from '../../api/therapist'
import { useAuth } from '../../auth/useAuth'
import { useCachedResource, type CachedResource } from '../../lib/useCachedResource'

export interface TherapistWorkspaceResources {
  patients: CachedResource<Patient[]>
  exercises: CachedResource<Exercise[]>
}

export function TherapistWorkspaceLayout() {
  const { tokenParsed, role } = useAuth()
  return <TherapistWorkspace key={`${tokenParsed?.sub}:${role}`} />
}

function TherapistWorkspace() {
  const patients = useCachedResource(listPatients, 'Не вдалося завантажити пацієнтів.')
  const exercises = useCachedResource(listExercises, 'Не вдалося завантажити вправи.')
  const resources: TherapistWorkspaceResources = { patients, exercises }

  return (
    <div className="therapist-workspace">
      <Outlet context={resources} />
    </div>
  )
}
