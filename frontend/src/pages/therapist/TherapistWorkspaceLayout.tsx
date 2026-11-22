import { Outlet } from 'react-router-dom'
import {
  listArchivedPatients,
  listExercises,
  listPatients,
  type Exercise,
  type Patient,
} from '../../api/therapist'
import { getMyPlan, type TherapistPlan } from '../../api/plans'
import { useAuth } from '../../auth/useAuth'
import { useCachedResource, type CachedResource } from '../../lib/useCachedResource'

export interface TherapistWorkspaceResources {
  patients: CachedResource<Patient[]>
  archivedPatients: CachedResource<Patient[]>
  plan: CachedResource<TherapistPlan>
  exercises: CachedResource<Exercise[]>
}

export function TherapistWorkspaceLayout() {
  const { tokenParsed, role } = useAuth()
  return <TherapistWorkspace key={`${tokenParsed?.sub}:${role}`} />
}

function TherapistWorkspace() {
  const patients = useCachedResource(listPatients, 'Не вдалося завантажити пацієнтів.')
  const archivedPatients = useCachedResource(
    listArchivedPatients,
    'Не вдалося завантажити архів пацієнтів.',
  )
  const exercises = useCachedResource(listExercises, 'Не вдалося завантажити вправи.')
  const plan = useCachedResource(getMyPlan, 'Не вдалося завантажити тариф.')
  const resources: TherapistWorkspaceResources = { patients, archivedPatients, plan, exercises }

  return (
    <div className="therapist-workspace">
      <Outlet context={resources} />
    </div>
  )
}
