import { describe, expect, it } from 'vitest'
import { pickUkrainianVoice } from './ukrainianVoice'

function voice(lang: string, name = lang): SpeechSynthesisVoice {
  return { lang, name } as SpeechSynthesisVoice
}

describe('pickUkrainianVoice', () => {
  it('finds a Ukrainian voice, including the Android spelling', () => {
    expect(pickUkrainianVoice([voice('en-US'), voice('uk-UA')])?.lang).toBe('uk-UA')
    expect(pickUkrainianVoice([voice('en-US'), voice('uk_UA')])?.lang).toBe('uk_UA')
    expect(pickUkrainianVoice([voice('uk')])?.lang).toBe('uk')
  })

  it('prefers uk-UA over another Ukrainian variant', () => {
    expect(pickUkrainianVoice([voice('uk-GB', 'a'), voice('uk-UA', 'b')])?.name).toBe('b')
  })

  it('does not take other languages that merely start with the same letters', () => {
    expect(pickUkrainianVoice([voice('ukr-XX'), voice('ru-RU'), voice('en-GB')])).toBeNull()
    expect(pickUkrainianVoice([])).toBeNull()
  })
})
