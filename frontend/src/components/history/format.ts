const LOCALE = 'uk-UA'

export function formatShortDate(value: string | number): string {
  return new Date(value).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' })
}

export function formatDateTime(value: string | number): string {
  return new Date(value).toLocaleString(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatWeek(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return `${formatShortDate(start.getTime())}–${formatShortDate(end.getTime())}`
}

export function formatNumber(value: number): string {
  return value.toLocaleString(LOCALE, { maximumFractionDigits: 1 })
}
