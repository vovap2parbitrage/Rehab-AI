import { useState } from 'react'
import { getSessionVideoUrl } from '../api/sessions'
import { getErrorMessage } from '../lib/errorMessage'

/** "Show video" button for the video a session was recorded from. */
export function SessionVideo({ sessionId }: { sessionId: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const show = async () => {
    setLoading(true)
    setError(null)
    try {
      setUrl(await getSessionVideoUrl(sessionId))
    } catch (reason: unknown) {
      setError(getErrorMessage(reason, 'Не вдалося відкрити відео.'))
    } finally {
      setLoading(false)
    }
  }

  if (url) {
    return (
      <div className="session-video">
        <video
          key={url}
          src={url}
          controls
          preload="metadata"
          style={{ width: '100%', maxWidth: '360px', maxHeight: '220px', objectFit: 'contain' }}
        />
        <button type="button" className="button button--ghost" onClick={() => setUrl(null)}>
          Сховати відео
        </button>
      </div>
    )
  }

  return (
    <div className="session-video">
      <button
        type="button"
        className="button button--ghost"
        onClick={() => void show()}
        disabled={loading}
      >
        {loading ? 'Завантажуємо…' : 'Переглянути відео виконання'}
      </button>
      {error && (
        <p className="session-video__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
