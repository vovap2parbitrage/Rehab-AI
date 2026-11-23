import { Outlet } from 'react-router-dom'
import type { Exercise, Patient } from '../../api/therapist'
import { getMyPlan, type TherapistPlan } from '../../api/plans'
import { useAuth } from '../../auth/useAuth'
import { useCachedResource, type CachedResource } from '../../lib/useCachedResource'

export interface TherapistWorkspaceResources {
  patients?: CachedResource<Patient[]>
  archivedPatients?: CachedResource<Patient[]>
  plan: CachedResource<TherapistPlan>
  exercises?: CachedResource<Exercise[]>
}

export function TherapistWorkspaceLayout() {
  const { tokenParsed, role } = useAuth()
  return <TherapistWorkspace key={`${tokenParsed?.sub}:${role}`} />
}

function TherapistWorkspace() {
  const plan = useCachedResource(getMyPlan, 'Не вдалося завантажити тариф.')

  return (
    <div className="therapist-workspace">
      <Outlet context={{ plan } satisfies TherapistWorkspaceResources} />
    </div>
  )
}
