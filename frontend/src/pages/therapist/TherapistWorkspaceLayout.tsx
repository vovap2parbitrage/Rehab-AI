import { Outlet } from 'react-router-dom'
import {
  getScoringOptions,
  getToday,
  listArchivedPatients,
  listExercises,
  listHiddenExercises,
  listPatients,
  type Exercise,
  type Patient,
  type ScoringOptions,
  type Today,
} from '../../api/therapist'
import { getMyPlan, type TherapistPlan } from '../../api/plans'
import { useAuth } from '../../auth/useAuth'
import { useCachedResource, type CachedResource } from '../../lib/useCachedResource'

export interface TherapistWorkspaceResources {
  patients: CachedResource<Patient[]>
  archivedPatients: CachedResource<Patient[]>
  plan: CachedResource<TherapistPlan>
  exercises: CachedResource<Exercise[]>
  hiddenExercises: CachedResource<Exercise[]>
  scoringOptions: CachedResource<ScoringOptions>
  today: CachedResource<Today>
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
  const hiddenExercises = useCachedResource(
    listHiddenExercises,
    'Не вдалося завантажити приховані вправи.',
  )
  const scoringOptions = useCachedResource(
    getScoringOptions,
    'Не вдалося завантажити параметри оцінювання.',
  )
  const today = useCachedResource(getToday, 'Не вдалося завантажити сторінку «Сьогодні».')
  const plan = useCachedResource(getMyPlan, 'Не вдалося завантажити тариф.')
  const resources: TherapistWorkspaceResources = {
    patients,
    archivedPatients,
    plan,
    exercises,
    hiddenExercises,
    scoringOptions,
    today,
  }

  return (
    <div className="therapist-workspace">
      <Outlet context={resources} />
    </div>
  )
}
