import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePoseAssistant } from './usePoseAssistant'

const createFromOptions = vi.fn()

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: vi.fn().mockResolvedValue({}) },
  PoseLandmarker: { createFromOptions: (...args: unknown[]) => createFromOptions(...args) },
}))

function detector(detect: () => unknown = () => ({ landmarks: [] })) {
  return { detectForVideo: vi.fn(detect), close: vi.fn() }
}

function delegateOf(call: number): string {
  return createFromOptions.mock.calls[call][1].baseOptions.delegate
}

const video = document.createElement('video')
Object.defineProperty(video, 'readyState', { value: 4 })
const stream = {} as MediaStream

function renderAssistant(bodyParts: readonly string[] = ['right_leg']) {
  return renderHook(
    (props: { parts: readonly string[] }) =>
      usePoseAssistant({
        video,
        stream,
        videoReady: true,
        active: true,
        bodyParts: props.parts,
      }),
    { initialProps: { parts: bodyParts } },
  )
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray(32 * 18 * 4) }),
  } as unknown as CanvasRenderingContext2D)
})

afterEach(() => {
  vi.restoreAllMocks()
  createFromOptions.mockReset()
})

describe('usePoseAssistant picks the best processor itself', () => {
  it('uses the GPU first', async () => {
    createFromOptions.mockResolvedValue(detector())

    const { result } = renderAssistant()

    await waitFor(() => expect(result.current.status).toBe('active'))
    expect(result.current.delegate).toBe('GPU')
    expect(createFromOptions).toHaveBeenCalledTimes(1)
    expect(delegateOf(0)).toBe('GPU')
  })

  it('falls back to the CPU when the GPU cannot start', async () => {
    createFromOptions.mockRejectedValueOnce(new Error('no webgl')).mockResolvedValue(detector())

    const { result } = renderAssistant()

    await waitFor(() => expect(result.current.status).toBe('active'))
    expect(result.current.delegate).toBe('CPU')
    expect([delegateOf(0), delegateOf(1)]).toEqual(['GPU', 'CPU'])
  })

  it('switches to the CPU when the GPU fails on the first frames', async () => {
    createFromOptions
      .mockResolvedValueOnce(
        detector(() => {
          throw new Error('gl context lost')
        }),
      )
      .mockResolvedValue(detector())

    const { result } = renderAssistant()

    await waitFor(() => expect(result.current.delegate).toBe('CPU'))
    expect(result.current.status).toBe('active')
  })

  it('does not reload the model when the same body parts arrive in a new array', async () => {
    createFromOptions.mockResolvedValue(detector())

    const { result, rerender } = renderAssistant(['right_leg', 'torso'])
    await waitFor(() => expect(result.current.status).toBe('active'))

    rerender({ parts: ['right_leg', 'torso'] })

    expect(createFromOptions).toHaveBeenCalledTimes(1)
  })

  it('says so when neither the GPU nor the CPU can run the model', async () => {
    createFromOptions.mockRejectedValue(new Error('no wasm'))

    const { result } = renderAssistant()

    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(createFromOptions).toHaveBeenCalledTimes(2)
  })

  it('stays out of the way when the assistant is switched off', () => {
    const { result } = renderHook(() =>
      usePoseAssistant({
        video,
        stream,
        videoReady: true,
        active: false,
        bodyParts: ['right_leg'],
      }),
    )

    expect(result.current.status).toBe('idle')
    expect(createFromOptions).not.toHaveBeenCalled()
  })
})
