import { useEffect, useRef, type SyntheticEvent } from 'react'
import { ErrorMessage } from '../../components/ErrorMessage'
import {
  COUNTDOWN_OPTIONS,
  MAX_RECORDING_SECONDS,
  type VideoRecorderState,
} from '../../lib/useVideoRecorder'

interface VideoRecorderProps {
  recorder: VideoRecorderState
  disabled?: boolean
  /** Called when the patient throws the recording away to record a new one. */
  onDiscard?: () => void
  onUseFileInstead: () => void
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** Chrome's recordings have no duration until the end is found, so the seek bar is empty. */
function revealDuration(event: SyntheticEvent<HTMLVideoElement>) {
  const video = event.currentTarget
  if (video.duration !== Infinity) return
  const rewind = () => {
    video.removeEventListener('timeupdate', rewind)
    video.currentTime = 0
  }
  video.addEventListener('timeupdate', rewind)
  video.currentTime = Number.MAX_SAFE_INTEGER
}

export function VideoRecorder({
  recorder,
  disabled = false,
  onDiscard,
  onUseFileInstead,
}: VideoRecorderProps) {
  const liveRef = useRef<HTMLVideoElement>(null)
  const { status, stream } = recorder

  useEffect(() => {
    const video = liveRef.current
    if (!video) return
    video.srcObject = stream
    // iOS only plays an inline camera preview when it is muted.
    video.muted = true
    if (stream) void video.play?.()?.catch(() => undefined)
    return () => {
      // A stopped camera left in srcObject would hide any `src` set on this element later.
      if (video.srcObject === stream) video.srcObject = null
    }
  }, [stream, status])

  const recordAgain = () => {
    onDiscard?.()
    void recorder.openCamera()
  }

  if (status === 'denied' || status === 'error') {
    return (
      <ErrorMessage
        title={status === 'denied' ? 'Немає доступу до камери' : 'Камера недоступна'}
        message={recorder.error ?? 'Не вдалося увімкнути камеру.'}
      >
        <button
          type="button"
          className="button button--primary button--sm"
          onClick={onUseFileInstead}
        >
          Завантажити файл замість запису
        </button>
        <button
          type="button"
          className="button button--ghost button--sm"
          onClick={() => void recorder.openCamera()}
        >
          Спробувати ще раз
        </button>
      </ErrorMessage>
    )
  }

  if (status === 'recorded' && recorder.previewUrl) {
    return (
      <div className="video-recorder">
        <div className="video-recorder__frame">
          {/* Own key: React must not reuse the camera's <video>, whose srcObject wins over src. */}
          <video
            key="recording"
            className="video-recorder__video"
            src={recorder.previewUrl}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={revealDuration}
            aria-label="Записане відео"
          />
        </div>
        <p className="video-recorder__hint">
          Запис {formatClock(recorder.elapsed)}. Перегляньте його перед надсиланням.
        </p>
        {recorder.stoppedAtLimit && (
          <p className="exercise-upload__notice" role="status">
            Запис зупинено автоматично: максимальна тривалість —{' '}
            {formatClock(MAX_RECORDING_SECONDS)}.
          </p>
        )}
        <div className="video-recorder__actions">
          <button
            type="button"
            className="button button--ghost"
            onClick={recordAgain}
            disabled={disabled}
          >
            Записати ще раз
          </button>
        </div>
      </div>
    )
  }

  if (status === 'idle') {
    return (
      <div className="video-recorder">
        <p className="video-recorder__hint">
          Поставте телефон так, щоб вас було видно повністю, і виконайте вправу. Відлік перед
          записом дасть час відійти від камери. Запис триває до {formatClock(MAX_RECORDING_SECONDS)}{' '}
          і зупиняється автоматично.
        </p>
        <div className="video-recorder__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => void recorder.openCamera()}
            disabled={disabled}
          >
            Увімкнути камеру
          </button>
        </div>
      </div>
    )
  }

  const recording = status === 'recording'
  const counting = status === 'countdown'
  return (
    <div className="video-recorder">
      <div className="video-recorder__frame">
        <video
          key="camera"
          ref={liveRef}
          className={`video-recorder__video${recorder.facing === 'user' ? ' video-recorder__video--mirrored' : ''}`}
          autoPlay
          muted
          playsInline
          aria-label="Зображення з камери"
        />
        {recording && (
          <span className="video-recorder__timer" role="timer" aria-live="off">
            <span className="video-recorder__dot" aria-hidden="true" />
            {formatClock(recorder.elapsed)} / {formatClock(MAX_RECORDING_SECONDS)}
          </span>
        )}
        {counting && recorder.countdownLeft !== null && (
          <span className="video-recorder__countdown" aria-hidden="true">
            {recorder.countdownLeft}
          </span>
        )}
      </div>
      {status === 'requesting' && (
        <p className="video-recorder__hint" role="status">
          Запитуємо доступ до камери…
        </p>
      )}
      {counting && (
        <p className="video-recorder__hint" role="status">
          Займіть місце перед камерою: запис почнеться через {recorder.countdownLeft} с.
        </p>
      )}
      {status === 'ready' && (
        <div className="video-recorder__countdown-picker">
          <span id="recording-countdown-label" className="video-recorder__hint">
            Відлік перед записом
          </span>
          <div className="video-source" role="group" aria-labelledby="recording-countdown-label">
            {COUNTDOWN_OPTIONS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                className="video-source__option"
                aria-pressed={recorder.countdownSeconds === seconds}
                disabled={disabled}
                onClick={() => recorder.setCountdownSeconds(seconds)}
              >
                {seconds === 0 ? 'Без' : `${seconds} с`}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="video-recorder__actions">
        {counting ? (
          <button type="button" className="button button--ghost" onClick={recorder.cancelCountdown}>
            Скасувати відлік
          </button>
        ) : recording ? (
          <button
            type="button"
            className="button button--danger-ghost"
            onClick={recorder.stopRecording}
          >
            Зупинити запис
          </button>
        ) : (
          <button
            type="button"
            className="button button--primary"
            onClick={recorder.startRecording}
            disabled={disabled || status !== 'ready'}
          >
            Почати запис
          </button>
        )}
        {recorder.canSwitchCamera && !recording && !counting && (
          <button
            type="button"
            className="button button--ghost"
            onClick={() => void recorder.switchCamera()}
            disabled={disabled || status !== 'ready'}
          >
            Змінити камеру
          </button>
        )}
        {!recording && !counting && (
          <button type="button" className="button button--ghost" onClick={recorder.discard}>
            Вимкнути камеру
          </button>
        )}
      </div>
    </div>
  )
}
