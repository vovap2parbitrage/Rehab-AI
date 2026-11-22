import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { getErrorMessage } from './errorMessage'
import {
  getMyHistory,
  getPatientHistory,
  type HistoryPeriod,
  type PatientHistory,
} from '../api/history'

/** Loads the signed-in patient's history, or the given patient's when `patientId` is set. */
export function usePatientHistory(patientId?: string) {
  const [period, setPeriod] = useState<HistoryPeriod>('30d')
  const [reloadKey, setReloadKey] = useState(0)
  const [history, setHistory] = useState<PatientHistory | null>(null)
  const [settled, setSettled] = useState<{
    key: string
    error: string | null
    notFound: boolean
  } | null>(null)
  const requestKey = `${patientId ?? 'me'}:${period}:${reloadKey}`

  useEffect(() => {
    const controller = new AbortController()
    const options = { signal: controller.signal }
    const request = patientId
      ? getPatientHistory(patientId, period, options)
      : getMyHistory(period, options)

    request
      .then((result) => {
        if (controller.signal.aborted) return
        setHistory(result)
        setSettled({ key: requestKey, error: null, notFound: false })
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        const notFound = reason instanceof ApiError && reason.kind === 'not-found'
        setSettled({
          key: requestKey,
          error: getErrorMessage(reason, 'Не вдалося завантажити історію виконання.'),
          notFound,
        })
      })

    return () => controller.abort()
  }, [patientId, period, requestKey])

  const refresh = useCallback(() => setReloadKey((key) => key + 1), [])
  const loading = settled?.key !== requestKey

  return {
    period,
    setPeriod,
    history,
    loading,
    error: loading ? null : settled.error,
    notFound: !loading && settled.notFound,
    refresh,
  }
}
