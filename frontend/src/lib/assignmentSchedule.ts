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

export function isAssignmentScheduledToday(
  startsOn: string,
  durationWeeks: number,
  weekdays: number[],
  today = getLocalDate(),
): boolean {
  const start = new Date(`${startsOn}T00:00:00`)
  const current = new Date(`${today}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + durationWeeks * 7 - 1)

  return current >= start && current <= end && weekdays.includes((current.getDay() + 6) % 7)
}
