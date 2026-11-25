import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POSE_RULES } from './poseMapping'
import { assessPoseWindow, type PoseLandmark } from './poseHints'
import { BODY_PART_LABELS } from './poseMapping'
import { phraseIdForText, recordedPhrases, VOICE_PHRASES, VoicePlayer } from './voice'

const played: string[] = []
const spoken: string[] = []

class FakeAudio {
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  src: string
  constructor(src: string) {
    this.src = src
  }
  play() {
    played.push(this.src)
    if (this.src.includes('broken')) return Promise.reject(new Error('missing'))
    queueMicrotask(() => this.onended?.())
    return Promise.resolve()
  }
  pause() {}
}

beforeEach(() => {
  played.length = 0
  spoken.length = 0
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      text: string
      lang = ''
      voice: unknown = null
      onend: (() => void) | null = null
      constructor(text: string) {
        this.text = text
      }
    },
  )
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      cancel: vi.fn(),
      speak: (utterance: { text: string; onend: (() => void) | null }) => {
        spoken.push(utterance.text)
        queueMicrotask(() => utterance.onend?.())
      },
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('voice phrases', () => {
  it('has a recorded phrase for whatever the position check says', () => {
    const still: PoseLandmark[] = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      visibility: 0,
    }))
    const window = Array.from({ length: POSE_RULES.historyFrames }, () => ({
      poseCount: 1,
      landmarks: still,
      meanLuminance: 10,
    }))
    const hints = [
      ...assessPoseWindow(window, Object.keys(BODY_PART_LABELS)).hints,
      ...assessPoseWindow([{ poseCount: 2, landmarks: null, meanLuminance: 80 }], []).hints,
      ...assessPoseWindow([{ poseCount: 0, landmarks: null, meanLuminance: 80 }], []).hints,
    ]
    expect(hints.length).toBeGreaterThan(5)
    for (const hint of hints) expect(phraseIdForText(hint)).not.toBeNull()
  })

  it('has the phrases that open the recording and start the exercise', () => {
    expect(VOICE_PHRASES['recording.started']).toBe('Запис почато.')
    expect(VOICE_PHRASES['exercise.start']).toBe('Можете починати виконання вправи.')
    expect(VOICE_PHRASES['count.21']).toBe('Двадцять один.')
  })

  it('uses a recorded file only when it says the current text', () => {
    const recorded = recordedPhrases({
      phrases: { 'count.1': VOICE_PHRASES['count.1'], 'count.2': 'Старий текст.' },
    })

    expect([...recorded]).toEqual(['count.1'])
    expect(recordedPhrases(null).size).toBe(0)
  })
})

describe('VoicePlayer', () => {
  it('plays the recorded phrases one after another', async () => {
    const player = new VoicePlayer()
    player.recorded = new Set(['count.3', 'fix.knee.r.too_bent'])

    player.say(['count.3', 'fix.knee.r.too_bent'])
    await flush()

    expect(played).toEqual(['/voice/count.3.mp3', '/voice/fix.knee.r.too_bent.mp3'])
  })

  it('reads a phrase without a file with the browser voice, or skips it without one', async () => {
    const player = new VoicePlayer()
    player.recorded = new Set(['count.1'])

    player.say(['count.2', 'count.1'])
    await flush()
    expect(spoken).toEqual([])
    expect(played).toEqual(['/voice/count.1.mp3'])

    player.browserVoice = { lang: 'uk-UA' } as SpeechSynthesisVoice
    player.say(['count.2'])
    await flush()
    expect(spoken).toEqual(['Два.'])
  })

  it('stops the rest of a message when something new is said', async () => {
    const player = new VoicePlayer()
    player.recorded = new Set(['count.1', 'count.2', 'recording.started'])

    player.say(['count.1', 'count.2'])
    player.say(['recording.started'])
    await flush()

    expect(played).toEqual(['/voice/count.1.mp3', '/voice/recording.started.mp3'])
  })

  it('queues a phrase after the current one and knows how long it has been silent', async () => {
    const player = new VoicePlayer()
    player.recorded = new Set(['recording.started', 'exercise.start'])
    expect(player.silentFor()).toBe(Infinity)

    player.say(['recording.started'])
    expect(player.silentFor()).toBe(0)
    player.enqueue(['exercise.start'])
    await flush()

    expect(played).toEqual(['/voice/recording.started.mp3', '/voice/exercise.start.mp3'])
    expect(player.silentFor(performance.now() + 2000)).toBeGreaterThanOrEqual(2000)
  })
})
