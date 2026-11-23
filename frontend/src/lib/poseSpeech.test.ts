import { describe, expect, it } from 'vitest'
import { getPoseSpeechMessage } from './poseSpeech'

describe('getPoseSpeechMessage', () => {
  const activeAssistant = {
    status: 'active' as const,
    hints: [],
    ready: true,
  }

  it('speaks the current hint and announces a ready position', () => {
    expect(
      getPoseSpeechMessage(
        'ready',
        null,
        { ...activeAssistant, hints: ['Відійдіть трохи далі від камери.'], ready: false },
        null,
      ),
    ).toBe('Відійдіть трохи далі від камери.')
    expect(getPoseSpeechMessage('ready', null, activeAssistant, null)).toBe(
      'Позиція підходить. Можна починати запис.',
    )
  })

  it('announces the countdown and recording completion', () => {
    expect(getPoseSpeechMessage('countdown', 5, activeAssistant, null)).toBe(
      'Запис почнеться через 5 секунд.',
    )
    expect(getPoseSpeechMessage('recorded', null, activeAssistant, null)).toBe(
      'Запис завершено. Перегляньте відео.',
    )
  })
})
