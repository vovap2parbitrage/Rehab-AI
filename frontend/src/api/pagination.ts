import { apiRequest, type RequestOptions } from './client'

interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

type CollectionResponse<T> = T[] | Page<T>

const PAGE_SIZE = 100

function pageUrl(path: string, offset: number): string {
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}limit=${PAGE_SIZE}&offset=${offset}`
}

/** Returns every item from APIs that may return either a list or paginated pages. */
export async function listAllPages<T>(path: string, options: RequestOptions = {}): Promise<T[]> {
  const firstPage = await apiRequest<CollectionResponse<T>>(pageUrl(path, 0), options)
  if (Array.isArray(firstPage)) return firstPage

  const items = [...firstPage.items]
  let offset = firstPage.offset + firstPage.items.length
  while (offset < firstPage.total) {
    const nextPage = await apiRequest<CollectionResponse<T>>(pageUrl(path, offset), options)
    if (Array.isArray(nextPage)) {
      items.push(...nextPage)
      break
    }
    if (nextPage.items.length === 0) {
      throw new Error('Paginated list returned no items before reaching its total.')
    }
    const nextOffset = nextPage.offset + nextPage.items.length
    if (nextOffset <= offset) {
      throw new Error('Paginated list did not advance to the next page.')
    }
    items.push(...nextPage.items)
    offset = nextOffset
  }
  return items
}
