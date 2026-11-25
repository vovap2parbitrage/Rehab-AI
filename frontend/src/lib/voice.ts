import { useEffect, useMemo, useRef, useState } from 'react'
import { useUkrainianVoice } from './ukrainianVoice'
import { VOICE_PHRASES } from './voicePhrases'

export { phraseIdForText, phraseText, VOICE_PHRASES } from './voicePhrases'
export const VOICE_BASE_URL = '/voice/'

/**
 * clips: the recorded files (any browser); browser: no files, but the browser has a Ukrainian
 * voice; none: nothing can be said in Ukrainian here.
 */
export type VoiceMode = 'checking' | 'clips' | 'browser' | 'none'

interface Manifest {
  phrases: Record<string, string>
}

let manifestRequest: Promise<Manifest | null> | null = null

/** The list scripts/generate_voice.py writes next to the files: which phrase each file says. */
function loadManifest(): Promise<Manifest | null> {
  manifestRequest ??= fetch(`${VOICE_BASE_URL}manifest.json`)
    .then((response) => (response.ok ? (response.json() as Promise<Manifest>) : null))
    .catch(() => null)
  return manifestRequest
}

/** A file is used only when it says exactly the current text of the phrase. */
export function recordedPhrases(manifest: Manifest | null): Set<string> {
  if (!manifest?.phrases) return new Set()
  return new Set(
    Object.entries(VOICE_PHRASES)
      .filter(([id, text]) => manifest.phrases[id] === text)
      .map(([id]) => id),
  )
}

/** Plays phrases one after another; a phrase without a file falls back to the browser voice. */
export class VoicePlayer {
  private audio: HTMLAudioElement | null = null
  private queue: string[] = []
  private run = 0
  private playing = false
  /** When the last phrase finished (ms, performance clock); 0 before anything was said. */
  private endedAt = 0
  recorded: Set<string> = new Set()
  browserVoice: SpeechSynthesisVoice | null = null

  /** Stops whatever is being said and says this instead. */
  say(ids: readonly string[]) {
    this.cancel()
    this.enqueue(ids)
  }

  /** Says this after what is being said now. */
  enqueue(ids: readonly string[]) {
    this.queue.push(...ids)
    if (!this.playing) this.next(this.run)
  }

  /** Milliseconds of silence so far; 0 while something is being said. */
  silentFor(now = performance.now()): number {
    if (this.playing) return 0
    return this.endedAt === 0 ? Infinity : now - this.endedAt
  }

  cancel() {
    this.run += 1
    this.queue = []
    this.audio?.pause()
    this.audio = null
    if (this.playing) this.endedAt = performance.now()
    this.playing = false
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
  }

  private next(run: number) {
    if (run !== this.run) return
    const id = this.queue.shift()
    if (id === undefined) {
      if (this.playing) this.endedAt = performance.now()
      this.playing = false
      return
    }
    this.playing = true
    const done = () => this.next(run)
    if (this.recorded.has(id)) {
      const audio = new Audio(`${VOICE_BASE_URL}${encodeURIComponent(id)}.mp3`)
      this.audio = audio
      audio.onended = done
      audio.onerror = () => this.speak(id, run)
      audio.play().catch(() => this.speak(id, run))
      return
    }
    this.speak(id, run)
  }

  private speak(id: string, run: number) {
    if (run !== this.run) return
    const text = VOICE_PHRASES[id]
    const voice = this.browserVoice
    if (!text || !voice || typeof SpeechSynthesisUtterance === 'undefined') {
      this.next(run)
      return
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = voice.lang
    utterance.voice = voice
    utterance.onend = () => this.next(run)
    utterance.onerror = () => this.next(run)
    window.speechSynthesis.speak(utterance)
  }
}

export interface Voice {
  mode: VoiceMode
  say: (ids: readonly string[]) => void
  enqueue: (ids: readonly string[]) => void
  silentFor: () => number
  cancel: () => void
}

export function useVoice(): Voice {
  const [recorded, setRecorded] = useState<Set<string> | null>(null)
  const browser = useUkrainianVoice()
  const player = useRef<VoicePlayer | null>(null)
  player.current ??= new VoicePlayer()

  useEffect(() => {
    let alive = true
    void loadManifest().then((manifest) => {
      if (alive) setRecorded(recordedPhrases(manifest))
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const current = player.current
    if (!current) return
    current.recorded = recorded ?? new Set()
    current.browserVoice = browser.voice
  }, [recorded, browser.voice])

  useEffect(() => () => player.current?.cancel(), [])

  const mode: VoiceMode =
    recorded !== null && recorded.size > 0
      ? 'clips'
      : browser.status === 'ready'
        ? 'browser'
        : recorded === null || browser.status === 'checking'
          ? 'checking'
          : 'none'

  return useMemo(
    () => ({
      mode,
      say: (ids: readonly string[]) => player.current?.say(ids),
      enqueue: (ids: readonly string[]) => player.current?.enqueue(ids),
      silentFor: () => player.current?.silentFor() ?? Infinity,
      cancel: () => player.current?.cancel(),
    }),
    [mode],
  )
}
