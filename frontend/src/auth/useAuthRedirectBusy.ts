import { useEffect, useState } from 'react'

export function useAuthRedirectBusy(onRestore?: () => void) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        setBusy(false)
        onRestore?.()
      }
    }

    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [onRestore])

  return [busy, setBusy] as const
}
