import { useCallback, useEffect, useRef, useState } from 'react'
import type { RequestOptions } from '../api/client'
import { getErrorMessage } from './errorMessage'

interface LoadOptions {
  refresh?: boolean
  background?: boolean
}

export interface CachedResource<T> {
  data: T | undefined
  loading: boolean
  error: string | null
  idle: boolean
  load: (options?: LoadOptions) => Promise<T | undefined>
  update: (apply: (current: T) => T) => void
  invalidate: () => void
}

export function useCachedResource<T>(
  fetchData: (options: Required<RequestOptions>) => Promise<T>,
  fallbackError: string,
): CachedResource<T> {
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cached = useRef<T | undefined>(undefined)
  const inFlight = useRef<{ controller: AbortController; result: Promise<T | undefined> } | null>(
    null,
  )
  const mounted = useRef(true)

  const cancel = useCallback(() => {
    inFlight.current?.controller.abort()
    inFlight.current = null
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      cancel()
    }
  }, [cancel])

  const load = useCallback(
    ({ refresh = false, background = false }: LoadOptions = {}) => {
      if (!mounted.current) return Promise.resolve(undefined)
      if (inFlight.current) return inFlight.current.result
      if (!refresh && cached.current !== undefined) return Promise.resolve(cached.current)

      const controller = new AbortController()
      const { signal } = controller
      setLoading(!background || cached.current === undefined)
      setError(null)

      const result = Promise.resolve().then(async () => {
        if (signal.aborted) return undefined
        try {
          const next = await fetchData({ signal })
          if (signal.aborted) return undefined
          cached.current = next
          setData(next)
          return next
        } catch (caught: unknown) {
          if (!signal.aborted) setError(getErrorMessage(caught, fallbackError))
          return undefined
        } finally {
          if (!signal.aborted) {
            inFlight.current = null
            setLoading(false)
          }
        }
      })
      inFlight.current = { controller, result }
      return result
    },
    [fetchData, fallbackError],
  )

  const update = useCallback(
    (apply: (current: T) => T) => {
      if (!mounted.current) return
      cancel()
      cached.current = cached.current === undefined ? undefined : apply(cached.current)
      setData(cached.current)
      setError(null)
      setLoading(false)
    },
    [cancel],
  )

  const invalidate = useCallback(() => {
    if (!mounted.current) return
    cancel()
    cached.current = undefined
    setData(undefined)
    setError(null)
    setLoading(false)
  }, [cancel])

  const idle = data === undefined && !loading && error === null
  return { data, error, idle, loading: loading || idle, load, update, invalidate }
}
