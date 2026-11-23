export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'] as const

export function formatWeekdays(weekdays: number[]): string {
  return weekdays.map((day) => WEEKDAYS[day]).join(' ')
}

export function getLocalDate(date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Monday is 0 and Sunday is 6, like the weekdays stored with an assignment. */
export function weekdayOf(date: string): number {
  return (new Date(`${date}T00:00:00`).getDay() + 6) % 7
}

/** The first date from `from` on (including it) that falls on one of the weekdays. */
export function nextSessionDate(from: string, weekdays: number[]): string {
  if (weekdays.length === 0) return from
  const day = new Date(`${from}T00:00:00`)
  while (!weekdays.includes(weekdayOf(getLocalDate(day)))) {
    day.setDate(day.getDate() + 1)
  }
  return getLocalDate(day)
}

/** "ср, 26 листопада" for a date like 2026-11-26. */
export function formatDay(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('uk-UA', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  })
}
