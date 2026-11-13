export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'] as const

export function formatWeekdays(weekdays: number[]): string {
  return weekdays.map((day) => WEEKDAYS[day]).join(' ')
}

export function isAssignmentScheduledToday(
  startsOn: string,
  durationWeeks: number,
  weekdays: number[],
  today = new Date(),
): boolean {
  const start = new Date(`${startsOn}T00:00:00`)
  const current = new Date(today)
  current.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + durationWeeks * 7 - 1)

  return current >= start && current <= end && weekdays.includes((current.getDay() + 6) % 7)
}
