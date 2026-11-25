import { useEffect, useMemo, useState } from 'react'
import type { PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import {
  assessPoseWindow,
  pickPatientPose,
  type PoseAssessment,
  type PoseSample,
} from './poseHints'
import { POSE_RULES } from './poseMapping'

const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm'
// The full model finds a person far more reliably in poor light; the GPU runs it easily. The
// CPU gets the lite one, which is about three times faster.
const POSE_MODEL_URLS = {
  GPU: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  CPU: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
} as const

export type PoseAssistantStatus = 'idle' | 'loading' | 'active' | 'unavailable'
/** What the model really runs on: the GPU, or the CPU (chosen, or after the GPU failed). */
export type PoseDelegate = 'GPU' | 'CPU'

export interface PoseAssistantState extends PoseAssessment {
  status: PoseAssistantStatus
  delegate: PoseDelegate | null
}

const EMPTY_STATE: PoseAssistantState = { status: 'idle', hints: [], ready: false, delegate: null }
const LOADING_STATE: PoseAssistantState = {
  status: 'loading',
  hints: [],
  ready: false,
  delegate: null,
}

interface StoredPoseAssistant {
  stream: MediaStream | null
  value: PoseAssistantState
}

interface UsePoseAssistantOptions {
  video: HTMLVideoElement | null
  stream: MediaStream | null
  videoReady: boolean
  active: boolean
  bodyParts: readonly string[]
}

function meanLuminance(
  video: HTMLVideoElement,
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): number {
  context.drawImage(video, 0, 0, width, height)
  const { data } = context.getImageData(0, 0, width, height)
  let total = 0
  for (let index = 0; index < data.length; index += 4) {
    total += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]
  }
  return total / (data.length / 4)
}

function toPoseSample(result: PoseLandmarkerResult, luminance: number): PoseSample {
  return { ...pickPatientPose(result.landmarks), meanLuminance: luminance }
}

export function usePoseAssistant({
  video,
  stream,
  videoReady,
  active,
  bodyParts,
}: UsePoseAssistantOptions): PoseAssistantState {
  const [stored, setStored] = useState<StoredPoseAssistant>({
    stream: null,
    value: EMPTY_STATE,
  })
  // A new array with the same parts must not restart the model, so compare by content.
  const bodyPartsKey = bodyParts.join(',')
  const parts = useMemo(() => (bodyPartsKey ? bodyPartsKey.split(',') : []), [bodyPartsKey])

  useEffect(() => {
    if (!active || !stream || !video) {
      return
    }
    if (!videoReady) return

    let disposed = false
    let stopped = false
    let detector: PoseLandmarker | null = null
    let create: ((kind: PoseDelegate) => Promise<PoseLandmarker>) | null = null
    let delegate: PoseDelegate | null = null
    let switching = false
    let animationFrame = 0
    let failureTimer = 0
    let lastSampleAt = -Infinity
    let lastTimestamp = 0
    let interval: number = POSE_RULES.sampleIntervalMs
    let slowFrames = 0
    let hopelessFrames = 0
    const samples: PoseSample[] = []
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 18
    const context = canvas.getContext('2d', { willReadFrequently: true })

    const fail = (message: string, reason?: unknown) => {
      if (disposed || stopped) return
      stopped = true
      if (reason) console.error('Local pose hints are unavailable.', reason)
      detector?.close()
      detector = null
      setStored({
        stream,
        value: { status: 'unavailable', hints: [message], ready: false, delegate: null },
      })
    }

    const adopt = (next: PoseLandmarker, kind: PoseDelegate) => {
      detector = next
      delegate = kind
      interval = kind === 'CPU' ? POSE_RULES.cpuSampleIntervalMs : POSE_RULES.sampleIntervalMs
      slowFrames = 0
      hopelessFrames = 0
      samples.length = 0
    }

    // The GPU can pass the start-up and still fail on the first frames (a driver or a browser
    // quirk): the assistant then carries on with the CPU instead of giving up.
    const fallbackToCpu = async (reason: unknown) => {
      console.error('Pose detection on the GPU failed, switching to the CPU.', reason)
      switching = true
      detector?.close()
      detector = null
      try {
        if (!create) throw reason
        const next = await create('CPU')
        if (disposed) {
          next.close()
          return
        }
        adopt(next, 'CPU')
        switching = false
        animationFrame = window.requestAnimationFrame(detectFrames)
      } catch (cpuReason: unknown) {
        switching = false
        fail('Підказки тимчасово недоступні. Запис можна почати вручну.', cpuReason)
      }
    }

    if (!context) {
      failureTimer = window.setTimeout(
        () => fail('Підказки недоступні на цьому пристрої. Запис можна почати вручну.'),
        0,
      )
      return () => {
        disposed = true
        window.clearTimeout(failureTimer)
      }
    }

    const detectFrames = () => {
      if (disposed || stopped || switching || !detector) return
      const now = performance.now()
      if (
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        now - lastSampleAt >= interval
      ) {
        lastSampleAt = now
        lastTimestamp = Math.max(Math.round(now), lastTimestamp + 1)
        const startedAt = performance.now()
        try {
          const result = detector.detectForVideo(video, lastTimestamp)
          const inferenceMs = performance.now() - startedAt
          hopelessFrames = inferenceMs > POSE_RULES.hopelessInferenceMs ? hopelessFrames + 1 : 0
          if (hopelessFrames >= POSE_RULES.hopelessInferenceFrames) {
            fail('Пристрій не встигає перевіряти кадри. Запис можна почати вручну.')
            return
          }
          // A slow device is checked less often rather than switched off.
          slowFrames = inferenceMs > POSE_RULES.maxInferenceMs ? slowFrames + 1 : 0
          if (slowFrames >= POSE_RULES.slowInferenceFrames) {
            interval = Math.min(interval * 2, POSE_RULES.maxSampleIntervalMs)
            slowFrames = 0
          }
          const luminance = meanLuminance(video, context, canvas.width, canvas.height)
          samples.push(toPoseSample(result, luminance))
          if (samples.length > POSE_RULES.historyFrames) samples.shift()
          setStored({
            stream,
            value: {
              status: 'active',
              delegate,
              ...assessPoseWindow(samples, parts),
            },
          })
        } catch (reason: unknown) {
          if (delegate === 'GPU') {
            void fallbackToCpu(reason)
          } else {
            fail('Підказки тимчасово недоступні. Запис можна почати вручну.', reason)
          }
          return
        }
      }
      animationFrame = window.requestAnimationFrame(detectFrames)
    }

    async function initialize() {
      try {
        const { FilesetResolver, PoseLandmarker: PoseLandmarkerTask } =
          await import('@mediapipe/tasks-vision')
        const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL)
        if (disposed) return
        create = (kind) =>
          PoseLandmarkerTask.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: POSE_MODEL_URLS[kind], delegate: kind },
            runningMode: 'VIDEO',
            numPoses: 2,
            outputSegmentationMasks: false,
          })
        // The GPU is much faster; a device without a usable one gets the CPU.
        const order: PoseDelegate[] = ['GPU', 'CPU']
        let lastReason: unknown = null
        for (const kind of order) {
          try {
            const next = await create(kind)
            if (disposed) {
              next.close()
              return
            }
            adopt(next, kind)
            animationFrame = window.requestAnimationFrame(detectFrames)
            return
          } catch (reason: unknown) {
            if (disposed) return
            lastReason = reason
          }
        }
        throw lastReason
      } catch (reason: unknown) {
        fail('Підказки не вдалося завантажити. Запис можна почати вручну.', reason)
      }
    }

    void initialize()
    return () => {
      disposed = true
      window.cancelAnimationFrame(animationFrame)
      window.clearTimeout(failureTimer)
      detector?.close()
      detector = null
    }
  }, [active, parts, stream, video, videoReady])

  if (!active || !stream || !video) return EMPTY_STATE
  if (!videoReady || stored.stream !== stream) return LOADING_STATE
  return stored.value
}
