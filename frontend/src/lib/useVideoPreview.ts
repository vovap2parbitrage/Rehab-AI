import { useCallback, useState } from 'react'
import { getExerciseVideoUrl } from '../api/uploads'
import { getErrorMessage } from './errorMessage'

/** Loads and hides the temporary reference-video links of exercises. */
export function useVideoPreview() {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const show = useCallback(async (exerciseId: string) => {
    setLoadingId(exerciseId)
    setError(null)
    try {
      const url = await getExerciseVideoUrl(exerciseId)
      setUrls((current) => ({ ...current, [exerciseId]: url }))
    } catch (reason: unknown) {
      setError(getErrorMessage(reason, 'Не вдалося відкрити еталонне відео.'))
    } finally {
      setLoadingId(null)
    }
  }, [])

  const hide = useCallback((exerciseId: string) => {
    setUrls((current) => {
      const next = { ...current }
      delete next[exerciseId]
      return next
    })
  }, [])

  return { urls, loadingId, error, show, hide }
}

export type VideoPreview = ReturnType<typeof useVideoPreview>
