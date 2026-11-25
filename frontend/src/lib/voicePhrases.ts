import phrases from './voicePhrases.json'

/**
 * Everything the voice agent can say, by id. Each phrase is also recorded as
 * public/voice/<id>.mp3 (scripts/generate_voice.py), so it sounds the same in every browser.
 */
export const VOICE_PHRASES: Readonly<Record<string, string>> = phrases

const idsByText = new Map(Object.entries(VOICE_PHRASES).map(([id, text]) => [text, id]))

export function phrase(id: string): string {
  const text = VOICE_PHRASES[id]
  if (text === undefined) throw new Error(`Unknown voice phrase: ${id}`)
  return text
}

export function phraseIdForText(text: string): string | null {
  return idsByText.get(text) ?? null
}

export function phraseText(ids: readonly string[]): string {
  return ids
    .map((id) => VOICE_PHRASES[id])
    .filter(Boolean)
    .join(' ')
}
