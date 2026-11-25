import { useEffect, useState } from 'react'

/** How long to wait for the browser to list its voices before deciding there is none. */
const VOICES_WAIT_MS = 1500

export type UkrainianVoice =
  | { status: 'checking'; voice: null }
  | { status: 'ready'; voice: SpeechSynthesisVoice }
  | { status: 'missing'; voice: null }

/** "uk-UA" and Android's "uk_UA" are both Ukrainian. */
export function pickUkrainianVoice(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  const ukrainian = voices.filter((voice) => /^uk([-_]|$)/i.test(voice.lang))
  return ukrainian.find((voice) => /^uk[-_]ua$/i.test(voice.lang)) ?? ukrainian[0] ?? null
}

function speechAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  )
}

function lookUp(): UkrainianVoice {
  if (!speechAvailable()) return { status: 'missing', voice: null }
  const voice = pickUkrainianVoice(window.speechSynthesis.getVoices())
  return voice ? { status: 'ready', voice } : { status: 'checking', voice: null }
}

/**
 * The Ukrainian voice of this browser. The hints are written in Ukrainian, so without such a
 * voice they must not be read aloud (a foreign voice would mangle them). Chrome lists its voices
 * a moment after the page loads, hence the short "checking" state.
 */
export function useUkrainianVoice(): UkrainianVoice {
  const [state, setState] = useState<UkrainianVoice>(lookUp)

  useEffect(() => {
    if (!speechAvailable()) return
    const synthesis = window.speechSynthesis
    const refresh = () => {
      const voice = pickUkrainianVoice(synthesis.getVoices())
      if (voice) setState({ status: 'ready', voice })
    }
    const giveUp = window.setTimeout(() => {
      setState((current) =>
        current.status === 'checking' ? { status: 'missing', voice: null } : current,
      )
    }, VOICES_WAIT_MS)
    synthesis.addEventListener?.('voiceschanged', refresh)
    return () => {
      window.clearTimeout(giveUp)
      synthesis.removeEventListener?.('voiceschanged', refresh)
    }
  }, [])

  return state
}
