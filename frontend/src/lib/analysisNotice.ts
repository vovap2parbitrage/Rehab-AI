import type { ComparisonResult } from '../api/comparisons'

export interface AnalysisNotice {
  title: string
  message: string
}

const RECORD_AGAIN = 'Запишіть відео ще раз.'
/** Share of frames the server needs the body parts in (MIN_VALID_PCT in the comparison). */
const MIN_VISIBLE_PCT = 80

/** Reasons the server gives for a video it could not analyse (English, from the worker). */
const FAILURE_REASONS: [RegExp, (match: RegExpMatchArray) => string][] = [
  [
    /cannot be read/i,
    () =>
      `Відео не вдалося прочитати: можливо, запис обірвався або файл пошкоджений. ${RECORD_AGAIN}`,
  ],
  [
    /longer than (\d+) seconds/i,
    (match) => `Відео задовге: максимальна тривалість — ${match[1]} с. ${RECORD_AGAIN}`,
  ],
  [
    /not a supported video/i,
    () => 'Формат відео не підтримується. Запишіть відео в застосунку або завантажте MP4 чи MOV.',
  ],
]

function failureMessage(serverMessage: string | null): string {
  for (const [pattern, describe] of FAILURE_REASONS) {
    const match = serverMessage?.match(pattern)
    if (match) return describe(match)
  }
  return 'Не вдалося проаналізувати відео. Спробуйте ще раз.'
}

/** What to tell the patient when the analysis gave no score, or null when it did. */
export function analysisNotice(result: ComparisonResult): AnalysisNotice | null {
  switch (result.status) {
    case 'done':
    case 'pending':
      return null
    case 'rerecord': {
      const quality = result.quality
      if (quality && !quality.ok && quality.patient_valid_frames_pct >= MIN_VISIBLE_PCT) {
        // The patient's video is fine: the doctor's reference is the one that cannot be used.
        return {
          title: 'Еталонне відео не підходить для порівняння',
          message:
            'Ваш запис у порядку, але на еталонному відео лікаря погано видно потрібні частини тіла. Завершіть вправу без відео і повідомте лікаря.',
        }
      }
      const seenPct = quality ? Math.round(quality.patient_valid_frames_pct) : null
      const problem =
        seenPct === 0
          ? 'На відео не вдалося розпізнати людину.'
          : `Частини тіла, які оцінює вправа, погано видно на відео${seenPct === null ? '' : ` — вони були в кадрі лише на ${seenPct}% відео`}.`
      return {
        title: 'Відео записано недостатньо добре',
        message: `${problem} Поставте камеру так, щоб вас було видно повністю, від голови до стоп, і не виходьте з кадру під час вправи. ${RECORD_AGAIN}`,
      }
    }
    case 'no_repetitions':
      return {
        title: 'Не знайдено повторень',
        message:
          'На відео не вдалося знайти повторень вправи. Запишіть ще раз і виконайте вправу кілька разів.',
      }
    default:
      return { title: 'Відео не проаналізовано', message: failureMessage(result.message) }
  }
}
