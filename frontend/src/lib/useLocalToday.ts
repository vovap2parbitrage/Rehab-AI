import { useEffect, useState } from 'react'
import { getLocalDate } from './assignmentSchedule'

export function useLocalToday(): string {
  const [today, setToday] = useState(getLocalDate)

  useEffect(() => {
    let midnightTimer: number | undefined

    function syncToday() {
      window.clearTimeout(midnightTimer)
      const now = new Date()
      setToday(getLocalDate(now))
      const nextMidnight = new Date(now).setHours(24, 0, 0, 0)
      midnightTimer = window.setTimeout(syncToday, nextMidnight - now.getTime())
    }

    syncToday()
    window.addEventListener('focus', syncToday)
    document.addEventListener('visibilitychange', syncToday)
    return () => {
      window.clearTimeout(midnightTimer)
      window.removeEventListener('focus', syncToday)
      document.removeEventListener('visibilitychange', syncToday)
    }
  }, [])

  return today
}
