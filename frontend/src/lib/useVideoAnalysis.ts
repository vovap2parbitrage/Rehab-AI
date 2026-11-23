import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { getComparison, startComparison, type ComparisonResult } from '../api/comparisons'
import { uploadVideo } from '../api/uploads'
import { getErrorMessage } from './errorMessage'

const POLL_INTERVAL_MS = 3000
const MAX_POLLS = 100

export type AnalysisPhase = 'idle' | 'uploading' | 'analyzing' | 'finished' | 'failed'

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/**
 * Uploads the patient's video, starts the analysis for an assignment and waits for
 * the result. A finished analysis is saved by the server as a session of the assignment.
 */
export function useVideoAnalysis(assignmentId: string | undefined, onDone?: () => void) {
  const [phase, setPhase] = useState<AnalysisPhase>('idle')
  const [result, setResult] = useState<ComparisonResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const mounted = useRef(true)
  const run = useRef(0)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const reset = useCallback(() => {
    run.current += 1
    setPhase('idle')
    setResult(null)
    setError(null)
    setNotConfigured(false)
  }, [])

  const start = useCallback(
    async (file: File, painScore: number | null, videoSha256?: string | null) => {
      if (!assignmentId) return
      run.current += 1
      const current = run.current
      const isCurrent = () => mounted.current && run.current === current
      const fail = (message: string, unavailable = false) => {
        setError(message)
        setNotConfigured(unavailable)
        setPhase('failed')
      }

      setResult(null)
      setError(null)
      setNotConfigured(false)
      setPhase('uploading')

      let key: string
      try {
        key = await uploadVideo(file)
      } catch (reason: unknown) {
        if (isCurrent()) fail(getErrorMessage(reason, 'Не вдалося завантажити відео.'))
        return
      }
      if (!isCurrent()) return

      setPhase('analyzing')
      let taskId: string
      try {
        taskId = (
          await startComparison({
            assignment_id: assignmentId,
            patient_key: key,
            pain_score: painScore,
            ...(videoSha256 ? { video_sha256: videoSha256 } : {}),
          })
        ).task_id
      } catch (reason: unknown) {
        if (!isCurrent()) return
        if (reason instanceof ApiError && reason.status === 409) {
          fail(
            'Для цієї вправи аналіз відео ще не налаштований або призначення неактивне. Завершіть сесію без відео.',
            true,
          )
        } else {
          fail(getErrorMessage(reason, 'Не вдалося запустити аналіз.'))
        }
        return
      }

      for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
        if (!isCurrent()) return
        let next: ComparisonResult
        try {
          next = await getComparison(taskId)
        } catch (reason: unknown) {
          if (isCurrent()) {
            fail(
              `${getErrorMessage(reason, 'Не вдалося отримати результат аналізу.')} Перевірте «Мої призначення»: якщо сесія вже є, аналіз завершено.`,
            )
          }
          return
        }
        if (!isCurrent()) return
        if (next.status !== 'pending') {
          setResult(next)
          setPhase('finished')
          if (next.status === 'done') onDoneRef.current?.()
          return
        }
        await wait(POLL_INTERVAL_MS)
      }
      if (isCurrent()) fail('Аналіз триває надто довго. Перевірте «Мої призначення» трохи пізніше.')
    },
    [assignmentId],
  )

  return { phase, result, error, notConfigured, start, reset }
}
