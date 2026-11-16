import type { VideoPreview } from '../lib/useVideoPreview'

interface ReferenceVideoProps {
  exerciseId: string
  preview: VideoPreview
  showLabel: string
}

/** "Show video" button that turns into a player with a "Hide video" button. */
export function ReferenceVideo({ exerciseId, preview, showLabel }: ReferenceVideoProps) {
  const url = preview.urls[exerciseId]

  return (
    <div className="exercise-card__video">
      {url ? (
        <div>
          <video
            key={url}
            src={url}
            controls
            preload="metadata"
            style={{ width: '100%', maxWidth: '360px', maxHeight: '220px', objectFit: 'contain' }}
          />
          <button
            type="button"
            className="button button--ghost"
            onClick={() => preview.hide(exerciseId)}
          >
            Сховати відео
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="button button--ghost"
          onClick={() => void preview.show(exerciseId)}
          disabled={preview.loadingId !== null}
        >
          {preview.loadingId === exerciseId ? 'Завантажуємо…' : showLabel}
        </button>
      )}
    </div>
  )
}
