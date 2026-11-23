import { useCallback, useEffect, useRef, useState } from 'react'

/** The backend refuses longer videos, so a recording stops on its own at this length. */
export const MAX_RECORDING_SECONDS = 120
// About 38 MB for two minutes: well below the 100 MB upload limit.
const VIDEO_BITS_PER_SECOND = 2_500_000
const TICK_MS = 250

/** Seconds the patient can choose to wait before recording starts, to step back from the camera. */
export const COUNTDOWN_OPTIONS = [0, 3, 5, 10] as const
export const DEFAULT_COUNTDOWN_SECONDS = 5
// Remembered on this device: it depends on where the patient puts the phone, not on the exercise.
export const COUNTDOWN_STORAGE_KEY = 'rehab-ai.recording-countdown'

function readCountdownSetting(): number {
  try {
    const stored = window.localStorage.getItem(COUNTDOWN_STORAGE_KEY)
    const seconds = Number(stored)
    if (stored !== null && (COUNTDOWN_OPTIONS as readonly number[]).includes(seconds)) {
      return seconds
    }
  } catch {
    // Storage can be blocked (private mode); the default is fine then.
  }
  return DEFAULT_COUNTDOWN_SECONDS
}

function saveCountdownSetting(seconds: number) {
  try {
    window.localStorage.setItem(COUNTDOWN_STORAGE_KEY, String(seconds))
  } catch {
    // Not remembered, but still used for this recording.
  }
}

// MP4 first (Safari, recent Chrome): the backend reads it directly. WebM otherwise.
const MIME_CANDIDATES = [
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
]
const EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

export type RecorderStatus =
  'idle' | 'requesting' | 'ready' | 'countdown' | 'recording' | 'recorded' | 'denied' | 'error'

export type CameraFacing = 'user' | 'environment'

/** True when this browser can record video inside the page (needs HTTPS or localhost). */
export function canRecordVideo(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext === true &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof window.MediaRecorder === 'function'
  )
}

export function pickRecordingMimeType(): string {
  const isTypeSupported = window.MediaRecorder?.isTypeSupported
  if (typeof isTypeSupported !== 'function') return ''
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

/** "video/mp4;codecs=avc1" → "video/mp4": storage expects the plain content type. */
export function baseMimeType(type: string): string {
  return type.split(';')[0].trim().toLowerCase()
}

function cameraErrorStatus(reason: unknown): { status: RecorderStatus; message: string } {
  const name = reason instanceof Error || reason instanceof DOMException ? reason.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return {
      status: 'denied',
      message:
        'Доступ до камери заборонено. Дозвольте його в налаштуваннях браузера або завантажте готовий файл.',
    }
  }
  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError'
  ) {
    return {
      status: 'error',
      message: 'Камеру не знайдено. Підключіть камеру або завантажте файл.',
    }
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return {
      status: 'error',
      message: 'Камера зайнята іншою програмою. Закрийте її та спробуйте ще раз.',
    }
  }
  return { status: 'error', message: 'Не вдалося увімкнути камеру. Спробуйте ще раз.' }
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

/**
 * Records the exercise with the device camera. The result is a File that goes through
 * the same upload and analysis as a selected file. Audio is not recorded: the analysis
 * does not use it and the patient is not asked for the microphone.
 */
export function useVideoRecorder() {
  const [supported] = useState(canRecordVideo)
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [stoppedAtLimit, setStoppedAtLimit] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [facing, setFacing] = useState<CameraFacing>('user')
  const [canSwitchCamera, setCanSwitchCamera] = useState(false)
  const [countdownSeconds, setCountdownSecondsState] = useState(readCountdownSetting)
  const [countdownLeft, setCountdownLeft] = useState<number | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const tickRef = useRef<number | undefined>(undefined)
  const limitRef = useRef<number | undefined>(undefined)
  const countdownRef = useRef<number | undefined>(undefined)
  const requestRef = useRef(0)
  const mounted = useRef(true)

  const clearTimers = () => {
    window.clearInterval(tickRef.current)
    window.clearTimeout(limitRef.current)
    window.clearInterval(countdownRef.current)
    tickRef.current = undefined
    limitRef.current = undefined
    countdownRef.current = undefined
  }

  const releaseCamera = useCallback(() => {
    stopStream(streamRef.current)
    streamRef.current = null
    setStream(null)
  }, [])

  const clearRecording = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setPreviewUrl(null)
    setFile(null)
    setElapsed(0)
    setStoppedAtLimit(false)
  }, [])

  /** Stops a running recording (or countdown) without keeping its result. */
  const abandonRecording = useCallback(() => {
    clearTimers()
    setCountdownLeft(null)
    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null
      recorder.onstop = null
      recorder.stop()
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      requestRef.current += 1
      abandonRecording()
      stopStream(streamRef.current)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [abandonRecording])

  const openCamera = useCallback(
    async (nextFacing: CameraFacing = facing) => {
      if (!supported) return
      requestRef.current += 1
      const request = requestRef.current
      abandonRecording()
      releaseCamera()
      clearRecording()
      setError(null)
      setFacing(nextFacing)
      setStatus('requesting')
      let media: MediaStream
      try {
        media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: nextFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
      } catch (reason: unknown) {
        if (!mounted.current || request !== requestRef.current) return
        const failure = cameraErrorStatus(reason)
        setError(failure.message)
        setStatus(failure.status)
        return
      }
      if (!mounted.current || request !== requestRef.current) {
        stopStream(media)
        return
      }
      streamRef.current = media
      setStream(media)
      setStatus('ready')
      try {
        const devices = (await navigator.mediaDevices.enumerateDevices?.()) ?? []
        if (mounted.current && request === requestRef.current) {
          setCanSwitchCamera(devices.filter((device) => device.kind === 'videoinput').length > 1)
        }
      } catch {
        // Only decides whether the switch button is shown.
      }
    },
    [abandonRecording, clearRecording, facing, releaseCamera, supported],
  )

  const switchCamera = useCallback(
    () => openCamera(facing === 'user' ? 'environment' : 'user'),
    [facing, openCamera],
  )

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }, [])

  const beginRecording = useCallback(() => {
    const media = streamRef.current
    if (!media || recorderRef.current) return
    const mimeType = pickRecordingMimeType()
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(media, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
      })
    } catch {
      setError('Ваш браузер не може записати відео. Завантажте готовий файл.')
      setStatus('error')
      return
    }

    const chunks: Blob[] = []
    const startedAt = Date.now()
    let autoStopped = false
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) chunks.push(event.data)
    }
    recorder.onerror = () => {
      clearTimers()
      recorderRef.current = null
      if (!mounted.current) return
      releaseCamera()
      setError('Запис перервано. Спробуйте записати ще раз.')
      setStatus('error')
    }
    recorder.onstop = () => {
      clearTimers()
      recorderRef.current = null
      if (!mounted.current) return
      const seconds = Math.min(
        MAX_RECORDING_SECONDS,
        Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
      )
      const type = baseMimeType(recorder.mimeType || mimeType || chunks[0]?.type || '')
      releaseCamera()
      if (!EXTENSIONS[type]) {
        setError('Браузер записав відео в непідтримуваному форматі. Завантажте готовий файл.')
        setStatus('error')
        return
      }
      const blob = new Blob(chunks, { type })
      if (blob.size === 0) {
        setError('Запис порожній. Спробуйте записати ще раз.')
        setStatus('error')
        return
      }
      const recorded = new File([blob], `recording-${startedAt}.${EXTENSIONS[type]}`, { type })
      const url = URL.createObjectURL(recorded)
      previewUrlRef.current = url
      setPreviewUrl(url)
      setFile(recorded)
      setElapsed(seconds)
      setStoppedAtLimit(autoStopped)
      setStatus('recorded')
    }

    recorderRef.current = recorder
    // No timeslice: Safari writes a broken file when the recording is split into chunks.
    recorder.start()
    setElapsed(0)
    setStoppedAtLimit(false)
    setError(null)
    setStatus('recording')
    tickRef.current = window.setInterval(() => {
      setElapsed(Math.min(MAX_RECORDING_SECONDS, Math.floor((Date.now() - startedAt) / 1000)))
    }, TICK_MS)
    limitRef.current = window.setTimeout(() => {
      autoStopped = true
      if (recorder.state !== 'inactive') recorder.stop()
    }, MAX_RECORDING_SECONDS * 1000)
  }, [releaseCamera])

  /** Starts recording, after the chosen countdown so the patient can step back from the camera. */
  const startRecording = useCallback(() => {
    if (!streamRef.current || recorderRef.current || countdownRef.current !== undefined) return
    if (countdownSeconds <= 0) {
      beginRecording()
      return
    }
    // Counted from a deadline, not by ticks: background tabs slow intervals down.
    const endsAt = Date.now() + countdownSeconds * 1000
    setError(null)
    setCountdownLeft(countdownSeconds)
    setStatus('countdown')
    countdownRef.current = window.setInterval(() => {
      const left = Math.ceil((endsAt - Date.now()) / 1000)
      if (left > 0) {
        setCountdownLeft(left)
        return
      }
      window.clearInterval(countdownRef.current)
      countdownRef.current = undefined
      setCountdownLeft(null)
      beginRecording()
    }, TICK_MS)
  }, [beginRecording, countdownSeconds])

  /** Stops the countdown; the camera stays on. */
  const cancelCountdown = useCallback(() => {
    if (countdownRef.current === undefined) return
    window.clearInterval(countdownRef.current)
    countdownRef.current = undefined
    setCountdownLeft(null)
    setStatus('ready')
  }, [])

  const setCountdownSeconds = useCallback((seconds: number) => {
    if (!(COUNTDOWN_OPTIONS as readonly number[]).includes(seconds)) return
    setCountdownSecondsState(seconds)
    saveCountdownSetting(seconds)
  }, [])

  /** Throws the recording away and turns the camera off. */
  const discard = useCallback(() => {
    requestRef.current += 1
    abandonRecording()
    releaseCamera()
    clearRecording()
    setError(null)
    setStatus('idle')
  }, [abandonRecording, clearRecording, releaseCamera])

  return {
    supported,
    status,
    stream,
    file,
    previewUrl,
    elapsed,
    stoppedAtLimit,
    error,
    facing,
    canSwitchCamera,
    countdownSeconds,
    countdownLeft,
    setCountdownSeconds,
    openCamera,
    switchCamera,
    startRecording,
    cancelCountdown,
    stopRecording,
    discard,
  }
}

export type VideoRecorderState = ReturnType<typeof useVideoRecorder>
