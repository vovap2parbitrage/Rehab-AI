import { useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { listNeedsAttention } from '../api/helpRequests'
import { useAuth } from '../auth/useAuth'
import { TherapistQuestionsContext } from './therapistQuestionsContext'
import { useCachedResource } from './useCachedResource'

function loadQuestionCount({ signal }: { signal: AbortSignal }) {
  return listNeedsAttention({ limit: 1, offset: 0, signal })
}

export function TherapistQuestionsProvider({ children }: { children: ReactNode }) {
  const { authenticated, role, tokenParsed } = useAuth()
  const enabled = authenticated && (role === 'therapist' || role === 'admin')
  const sessionKey = authenticated ? `session:${tokenParsed?.sub ?? ''}` : 'anonymous'

  return (
    <TherapistQuestionsCache key={sessionKey} enabled={enabled}>
      {children}
    </TherapistQuestionsCache>
  )
}

function TherapistQuestionsCache({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { pathname } = useLocation()
  const questions = useCachedResource(
    loadQuestionCount,
    'Не вдалося завантажити запитання пацієнтів.',
  )
  const { load, invalidate } = questions

  useEffect(() => {
    if (enabled) void load({ refresh: true, background: true })
    else invalidate()
  }, [enabled, load, invalidate, pathname])

  return (
    <TherapistQuestionsContext.Provider value={questions}>
      {children}
    </TherapistQuestionsContext.Provider>
  )
}
