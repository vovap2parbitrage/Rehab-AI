import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '../api/client'
import { uploadVideo } from '../api/uploads'

vi.mock('../api/client', () => ({ apiRequest: vi.fn() }))

const target = { key: 'videos/u/' + 'a'.repeat(32) + '.webm', url: 'https://s3.test/b', fields: {} }

describe('uploadVideo', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockResolvedValue(target)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it.each([
    ['video/webm', 'video/webm'],
    ['video/mp4;codecs=avc1.42E01E', 'video/mp4'],
    ['video/webm; codecs="vp9"', 'video/webm'],
  ])('asks for an upload of %s as %s', async (type, contentType) => {
    await expect(uploadVideo(new File(['v'], 'recording', { type }))).resolves.toBe(target.key)

    expect(apiRequest).toHaveBeenCalledWith('/api/v1/comparisons/uploads', {
      method: 'POST',
      body: JSON.stringify({ content_type: contentType }),
    })
  })

  it('refuses other formats before asking the server', async () => {
    await expect(
      uploadVideo(new File(['v'], 'clip.mkv', { type: 'video/x-matroska' })),
    ).rejects.toThrow('Дозволені тільки MP4, MOV та WebM.')
    expect(apiRequest).not.toHaveBeenCalled()
  })
})
