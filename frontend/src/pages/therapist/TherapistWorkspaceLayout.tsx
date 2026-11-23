import { Outlet } from 'react-router-dom'
import { getScoringOptions, getToday, type ScoringOptions, type Today } from '../../api/therapist'
import { getMyPlan, type TherapistPlan } from '../../api/plans'
import { useAuth } from '../../auth/useAuth'
import { useCachedResource, type CachedResource } from '../../lib/useCachedResource'

export interface TherapistWorkspaceResources {
  plan: CachedResource<TherapistPlan>
  scoringOptions: CachedResource<ScoringOptions>
  today: CachedResource<Today>
}

export function TherapistWorkspaceLayout() {
  const { tokenParsed, role } = useAuth()
  return <TherapistWorkspace key={`${tokenParsed?.sub}:${role}`} />
}

function TherapistWorkspace() {
  const scoringOptions = useCachedResource(
    getScoringOptions,
    'Не вдалося завантажити параметри оцінювання.',
  )
  const today = useCachedResource(getToday, 'Не вдалося завантажити сторінку «Сьогодні».')
  const plan = useCachedResource(getMyPlan, 'Не вдалося завантажити тариф.')
  const resources: TherapistWorkspaceResources = { plan, scoringOptions, today }

  return (
    <div className="therapist-workspace">
      <Outlet context={resources} />
    </div>
  )
}
