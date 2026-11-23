import { afterEach, describe, expect, it, vi } from 'vitest'
import { sha256File } from '../lib/videoHash'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sha256File', () => {
  it('hashes the exact file bytes as lowercase hexadecimal', async () => {
    const bytes = Uint8Array.from([1, 2, 3]).buffer
    const digest = new Uint8Array(32).fill(0xab).buffer
    const arrayBuffer = vi.fn().mockResolvedValue(bytes)
    const subtle = { digest: vi.fn().mockResolvedValue(digest) }
    const file = new File(['video'], 'clip.mp4')
    Object.defineProperty(file, 'arrayBuffer', { value: arrayBuffer })
    vi.stubGlobal('crypto', { subtle })

    await expect(sha256File(file)).resolves.toBe('ab'.repeat(32))

    expect(arrayBuffer).toHaveBeenCalledOnce()
    expect(subtle.digest).toHaveBeenCalledWith('SHA-256', bytes)
  })

  it('skips hashing when Web Crypto is unavailable', async () => {
    vi.stubGlobal('crypto', undefined)

    await expect(sha256File(new File(['video'], 'clip.mp4'))).resolves.toBeNull()
  })
})
