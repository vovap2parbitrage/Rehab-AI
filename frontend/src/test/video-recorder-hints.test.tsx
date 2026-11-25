import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POSE_SETTINGS_KEY } from '../lib/poseSettings'
import { usePoseAssistant, type PoseAssistantState } from '../lib/usePoseAssistant'
import { useLiveRepetitions } from '../lib/useLiveRepetitions'
import type { VideoRecorderState } from '../lib/useVideoRecorder'
import { VideoRecorder } from '../pages/patient/VideoRecorder'

vi.mock('../lib/usePoseAssistant', () => ({ usePoseAssistant: vi.fn() }))
vi.mock('../lib/useLiveRepetitions', () => ({
  useLiveReference: vi.fn(() => ({ status: 'ready', reference: null })),
  useLiveRepetitions: vi.fn(),
}))

const ukrainian = { lang: 'uk-UA', name: 'Ukrainian' } as SpeechSynthesisVoice
const speak = vi.fn((utterance: { text: string; onend?: (() => void) | null }) => {
  queueMicrotask(() => utterance.onend?.())
})
const said = () => speak.mock.calls.map((call) => call[0].text)
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function setVoices(voices: SpeechSynthesisVoice[]) {
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => voices,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      cancel: vi.fn(),
      speak,
    },
  })
}

function assistant(overrides: Partial<PoseAssistantState> = {}): PoseAssistantState {
  return { status: 'active', hints: [], ready: false, delegate: 'GPU', ...overrides }
}

const stream = {} as MediaStream

function recorder(overrides: Partial<VideoRecorderState> = {}): VideoRecorderState {
  return {
    status: 'ready',
    stream,
    facing: 'user',
    canSwitchCamera: false,
    countdownSeconds: 0,
    countdownLeft: null,
    elapsed: 0,
    error: null,
    previewUrl: null,
    stoppedAtLimit: false,
    setCountdownSeconds: vi.fn(),
    openCamera: vi.fn(),
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    cancelCountdown: vi.fn(),
    switchCamera: vi.fn(),
    discard: vi.fn(),
    ...overrides,
  } as unknown as VideoRecorderState
}

function element(state: VideoRecorderState) {
  return (
    <VideoRecorder
      recorder={state}
      assignmentId="assignment-1"
      bodyParts={['right_leg']}
      onUseFileInstead={vi.fn()}
    />
  )
}

/** Renders the camera in the countdown, then lets the recording start. */
function startRecording() {
  const view = render(element(recorder({ status: 'countdown', countdownLeft: 1 })))
  view.rerender(element(recorder({ status: 'recording' })))
  return view
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.mocked(usePoseAssistant).mockReturnValue(
    assistant({ hints: ['Підійдіть трохи ближче до камери.'] }),
  )
  vi.mocked(useLiveRepetitions).mockReturnValue({ count: 0, feedback: null, onFrame: vi.fn() })
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      text: string
      lang = ''
      voice: SpeechSynthesisVoice | null = null
      onend: (() => void) | null = null
      constructor(text: string) {
        this.text = text
      }
    },
  )
  setVoices([ukrainian])
})

afterEach(() => {
  window.localStorage.clear()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('Voice agent in the recorder', () => {
  it('stays silent before the recording, while still showing where to stand', async () => {
    render(element(recorder()))

    expect(screen.getByText('Підійдіть трохи ближче до камери.')).toBeInTheDocument()
    await wait(2500)
    expect(speak).not.toHaveBeenCalled()
  })

  it('starts with "Запис почато", then says where to stand after a pause', async () => {
    startRecording()

    await waitFor(() => expect(said()).toEqual(['Запис почато.']))
    await wait(1000)
    expect(said()).toEqual(['Запис почато.']) // at least two seconds of silence first
    await waitFor(() => expect(said()).toContain('Підійдіть трохи ближче до камери.'), {
      timeout: 3000,
    })
  })

  it('announces the start of the exercise once the patient is seen, then only counts', async () => {
    vi.mocked(usePoseAssistant).mockReturnValue(assistant({ ready: true }))
    startRecording()

    await waitFor(() =>
      expect(said()).toEqual(['Запис почато.', 'Можете починати виконання вправи.']),
    )
    expect(useLiveRepetitions).toHaveBeenLastCalledWith(null, true)
    expect(screen.getByText('Повторень:')).toBeInTheDocument()
  })

  it('does not count before the exercise starts', () => {
    startRecording()

    expect(useLiveRepetitions).toHaveBeenLastCalledWith(null, false)
  })

  it('says the number of a repetition and then what to correct', async () => {
    vi.mocked(usePoseAssistant).mockReturnValue(assistant({ ready: true }))
    vi.mocked(useLiveRepetitions).mockReturnValue({
      count: 2,
      feedback: {
        number: 2,
        message: 'Два. Зігніть праве коліно більше.',
        clips: ['count.2', 'fix.knee.r.too_straight'],
        mistakes: 1,
      },
      onFrame: vi.fn(),
    })
    startRecording()

    await waitFor(() =>
      expect(said()).toEqual([
        'Запис почато.',
        'Можете починати виконання вправи.',
        'Два.',
        'Зігніть праве коліно більше.',
      ]),
    )
    expect(screen.getByText('Два. Зігніть праве коліно більше.')).toBeInTheDocument()
  })

  it('stays silent when the patient switched the voice off, and remembers it', async () => {
    const user = userEvent.setup()
    const view = render(element(recorder()))

    await user.click(screen.getByRole('checkbox', { name: 'Голосовий помічник' }))
    expect(JSON.parse(window.localStorage.getItem(POSE_SETTINGS_KEY) ?? '{}')).toEqual({
      voice: false,
    })

    view.rerender(element(recorder({ status: 'recording' })))
    await wait(500)
    expect(speak).not.toHaveBeenCalled()
  })

  it('offers no choice but the voice: no processor, no assistant switch, no auto-start', () => {
    render(element(recorder()))

    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'GPU' })).toBeNull()
  })

  it('disables the voice where it cannot speak Ukrainian', async () => {
    setVoices([{ lang: 'en-US', name: 'English' } as SpeechSynthesisVoice])
    render(element(recorder()))

    const voice = await screen.findByRole(
      'checkbox',
      { name: 'Голос недоступний у цьому браузері' },
      { timeout: 3000 },
    )
    expect(voice).toBeDisabled()
  })
})
