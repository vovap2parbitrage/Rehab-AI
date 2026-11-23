import type { RequestOptions } from './client'

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface PageRequestOptions extends RequestOptions {
  q?: string
  limit?: number
  offset?: number
}

export function pageQuery(options: PageRequestOptions = {}): string {
  const params = new URLSearchParams()
  if (options.q?.trim()) params.set('q', options.q.trim())
  params.set('limit', String(options.limit ?? 20))
  params.set('offset', String(options.offset ?? 0))
  return params.toString()
}
