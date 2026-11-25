import { afterEach, describe, expect, it, vi } from 'vitest'
import { POSE_SETTINGS_KEY, readPoseSettings, savePoseSettings } from './poseSettings'

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('voice agent setting', () => {
  it('is on by default', () => {
    expect(readPoseSettings()).toEqual({ voice: true })
  })

  it('remembers that the patient switched it off', () => {
    savePoseSettings({ voice: false })

    expect(readPoseSettings()).toEqual({ voice: false })
  })

  it('ignores the old settings with a processor choice, keeping the voice choice', () => {
    window.localStorage.setItem(
      POSE_SETTINGS_KEY,
      JSON.stringify({ hints: true, voice: false, processing: 'cpu' }),
    )

    expect(readPoseSettings()).toEqual({ voice: false })
  })

  it('survives broken JSON and blocked storage', () => {
    window.localStorage.setItem(POSE_SETTINGS_KEY, '{nope')
    expect(readPoseSettings()).toEqual({ voice: true })

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readPoseSettings()).toEqual({ voice: true })
    expect(() => savePoseSettings({ voice: true })).not.toThrow()
  })
})
