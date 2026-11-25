import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { ErrorMessage } from '../../components/ErrorMessage'
import {
  COUNTDOWN_OPTIONS,
  MAX_RECORDING_SECONDS,
  type VideoRecorderState,
} from '../../lib/useVideoRecorder'
import { usePoseAssistant } from '../../lib/usePoseAssistant'
import { usePoseSettings } from '../../lib/poseSettings'
import { useLiveReference, useLiveRepetitions } from '../../lib/useLiveRepetitions'
import { phraseIdForText, useVoice } from '../../lib/voice'

interface VideoRecorderProps {
  recorder: VideoRecorderState
  /** The assignment being recorded: its reference decides what counts as a good repetition. */
  assignmentId: string
  bodyParts: readonly string[]
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

/** What the screen shows while recording: where to stand, then the repetitions. */
function RecordingProgress({
  exerciseStarted,
  count,
  message,
  hint,
  referenceStatus,
  assistantStatus,
}: {
  exerciseStarted: boolean
  count: number
  message: string | null
  hint: string | null
  referenceStatus: 'idle' | 'loading' | 'ready' | 'unavailable'
  assistantStatus: 'idle' | 'loading' | 'active' | 'unavailable'
}) {
  if (assistantStatus === 'unavailable') {
    return <p>Підказки недоступні. Запис триває, аналіз буде після нього.</p>
  }
  if (!exerciseStarted) {
    return <p>{hint ?? 'Станьте так, щоб вас було добре видно. Перевіряємо кадр…'}</p>
  }
  if (referenceStatus === 'unavailable') {
    return (
      <p>Можете виконувати вправу. Підрахунок повторень недоступний, аналіз буде після запису.</p>
    )
  }
  if (referenceStatus !== 'ready') return <p>Готуємо підрахунок повторень…</p>
  return (
    <>
      <p className="video-recorder__reps">
        Повторень: <strong>{count}</strong>
      </p>
      {message && <p>{message}</p>}
    </>
  )
}

/** At least this much silence between two hints about where to stand. */
const HINT_PAUSE_MS = 2000
/** The same hint is repeated only after this long. */
const SAME_HINT_PAUSE_MS = 5000

export function VideoRecorder({
  recorder,
  assignmentId,
  bodyParts,
  disabled = false,
  onDiscard,
  onUseFileInstead,
}: VideoRecorderProps) {
  const liveRef = useRef<HTMLVideoElement>(null)
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const [videoReadyStream, setVideoReadyStream] = useState<MediaStream | null>(null)
  const [settings, updateSettings] = usePoseSettings()
  const voice = useVoice()
  const { status, stream } = recorder
  const videoReady = stream !== null && videoReadyStream === stream
  const recording = status === 'recording'
  const counting = status === 'countdown'
  const monitoring = status === 'ready' || counting || recording
  // Recorded Ukrainian phrases work in any browser; without them only a Ukrainian browser voice.
  const voiceAvailable = voice.mode === 'clips' || voice.mode === 'browser'
  const voiceOn = settings.voice && voiceAvailable
  // Every recording first checks where the patient stands; the exercise starts after that.
  const [runs, setRuns] = useState({ recording: 0, exercise: -1 })
  const exerciseStarted = recording && runs.exercise === runs.recording
  const setLiveVideo = useCallback((element: HTMLVideoElement | null) => {
    liveRef.current = element
    setVideo(element)
  }, [])
  const liveReference = useLiveReference(assignmentId, monitoring)
  const live = useLiveRepetitions(liveReference.reference, exerciseStarted)
  const assistant = usePoseAssistant({
    video,
    stream,
    videoReady,
    active: monitoring,
    bodyParts,
    onFrame: live.onFrame,
  })
  const { say, enqueue, silentFor, cancel: silence } = voice

  // The voice is silent until the recording starts, and everything begins with "Запис почато".
  const previousStatus = useRef(status)
  useEffect(() => {
    const before = previousStatus.current
    previousStatus.current = status
    if (status === before) return
    if (status === 'recording') {
      setRuns((current) => ({ ...current, recording: current.recording + 1 }))
      if (voiceOn) say(['recording.started'])
    } else {
      silence()
    }
  }, [say, silence, status, voiceOn])

  // While recording, before the exercise: where to stand, at most every two seconds, until the
  // needed joints are seen; then "Можете починати виконання вправи" and only the count follows.
  const latest = useRef({ assistant, voiceOn })
  useEffect(() => {
    latest.current = { assistant, voiceOn }
  })
  const lastHint = useRef<{ id: string | null; at: number }>({ id: null, at: 0 })
  useEffect(() => {
    if (!recording || exerciseStarted) return
    lastHint.current = { id: null, at: 0 }
    const timer = window.setInterval(() => {
      const { assistant: current, voiceOn: speaking } = latest.current
      if (current.status !== 'active') return
      if (current.ready) {
        setRuns((runsNow) => ({ ...runsNow, exercise: runsNow.recording }))
        if (speaking) enqueue(['exercise.start'])
        return
      }
      const id = current.hints[0] ? phraseIdForText(current.hints[0]) : null
      if (!speaking || !id || silentFor() < HINT_PAUSE_MS) return
      const now = performance.now()
      if (id === lastHint.current.id && now - lastHint.current.at < SAME_HINT_PAUSE_MS) return
      lastHint.current = { id, at: now }
      say([id])
    }, 250)
    return () => window.clearInterval(timer)
  }, [enqueue, exerciseStarted, recording, say, silentFor])

  // After a repetition: its number, then what to correct; silent when it was right.
  const feedback = live.feedback
  useEffect(() => {
    if (feedback && voiceOn && exerciseStarted) enqueue(feedback.clips)
  }, [enqueue, exerciseStarted, feedback, voiceOn])

  // Switching the voice off silences it at once.
  useEffect(() => {
    if (!voiceOn) silence()
  }, [silence, voiceOn])

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
  }, [stream])

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

  return (
    <div className="video-recorder">
      <div className="video-recorder__frame">
        <video
          key="camera"
          ref={setLiveVideo}
          className={`video-recorder__video${recorder.facing === 'user' ? ' video-recorder__video--mirrored' : ''}`}
          autoPlay
          muted
          playsInline
          onLoadedData={() => setVideoReadyStream(stream)}
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
      {monitoring && (
        <div className="video-recorder__assistant">
          <div className="video-recorder__assistant-heading">
            <strong>Помічник</strong>
            <label className="video-recorder__voice">
              <input
                type="checkbox"
                checked={voiceOn}
                disabled={!voiceAvailable}
                onChange={(event) => updateSettings({ voice: event.currentTarget.checked })}
              />
              <span>
                {voiceAvailable
                  ? 'Голосовий помічник'
                  : voice.mode === 'checking'
                    ? 'Перевіряємо голос…'
                    : 'Голос недоступний у цьому браузері'}
              </span>
            </label>
          </div>
          <div role="status" aria-live="polite" className="video-recorder__assistant-status">
            {recording ? (
              <RecordingProgress
                exerciseStarted={exerciseStarted}
                count={live.count}
                message={feedback?.message ?? null}
                hint={assistant.hints[0] ?? null}
                referenceStatus={liveReference.status}
                assistantStatus={assistant.status}
              />
            ) : assistant.status === 'loading' ? (
              <p>Готуємо помічника…</p>
            ) : assistant.status === 'unavailable' ? (
              <p>{assistant.hints[0]}</p>
            ) : assistant.ready ? (
              <p>Позиція підходить — можна починати запис.</p>
            ) : assistant.hints.length > 0 ? (
              <ul>
                {assistant.hints.map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ul>
            ) : (
              <p>Перевіряємо кадр…</p>
            )}
          </div>
        </div>
      )}
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
