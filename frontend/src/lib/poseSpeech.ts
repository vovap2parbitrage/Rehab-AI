import type { PoseAssistantState } from './usePoseAssistant'
import type { RecorderStatus } from './useVideoRecorder'

export function getPoseSpeechMessage(
  status: RecorderStatus,
  countdownLeft: number | null,
  assistant: PoseAssistantState,
  error: string | null,
): string | null {
  if (status === 'requesting') return 'Запитую доступ до камери.'
  if (status === 'countdown') {
    return countdownLeft === null
      ? 'Починаю запис.'
      : `Запис почнеться через ${countdownLeft} секунд.`
  }
  if (status === 'recorded') return 'Запис завершено. Перегляньте відео.'
  if (status === 'denied' || status === 'error') {
    return error ?? 'Камера недоступна.'
  }
  if (status !== 'ready' && status !== 'recording') return null

  if (assistant.status === 'loading') return 'Завантажую помічника пози.'
  if (assistant.status === 'unavailable') {
    return assistant.hints[0] ?? 'Підказки недоступні. Можете записати вручну.'
  }
  if (assistant.status !== 'active') return null
  if (assistant.hints.length > 0) return assistant.hints[0]
  if (assistant.ready) {
    return status === 'recording'
      ? 'Позиція добра. Запис триває.'
      : 'Позиція підходить. Можна починати запис.'
  }
  return 'Перевіряю кадр.'
}
