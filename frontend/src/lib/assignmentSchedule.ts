export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'] as const

export function formatWeekdays(weekdays: number[]): string {
  return weekdays.map((day) => WEEKDAYS[day]).join(' ')
}
