import { createContext, useContext } from 'react'
import type { HelpRequest } from '../api/helpRequests'
import type { Page } from '../api/pagination'
import type { CachedResource } from './useCachedResource'

export const TherapistQuestionsContext = createContext<CachedResource<Page<HelpRequest>> | null>(
  null,
)

export function useTherapistQuestions() {
  const resource = useContext(TherapistQuestionsContext)
  if (!resource) {
    throw new Error('useTherapistQuestions must be used inside TherapistQuestionsProvider')
  }
  return resource
}
