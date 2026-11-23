import { useEffect, useState } from 'react'
import type { PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { assessPoseWindow, type PoseAssessment, type PoseSample } from './poseHints'
import { POSE_RULES } from './poseMapping'

const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm'
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

export type PoseAssistantStatus = 'idle' | 'loading' | 'active' | 'unavailable'

export interface PoseAssistantState extends PoseAssessment {
  status: PoseAssistantStatus
}

const EMPTY_STATE: PoseAssistantState = { status: 'idle', hints: [], ready: false }
const LOADING_STATE: PoseAssistantState = { status: 'loading', hints: [], ready: false }

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
  return {
    poseCount: result.landmarks.length,
    landmarks: result.landmarks[0] ?? null,
    meanLuminance: luminance,
  }
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

  useEffect(() => {
    if (!active || !stream || !video) {
      return
    }
    if (!videoReady) return

    let disposed = false
    let stopped = false
    let detector: PoseLandmarker | null = null
    let animationFrame = 0
    let failureTimer = 0
    let lastSampleAt = -Infinity
    let lastTimestamp = 0
    let slowFrames = 0
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
        value: { status: 'unavailable', hints: [message], ready: false },
      })
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
      if (disposed || stopped || !detector) return
      const now = performance.now()
      if (
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        now - lastSampleAt >= POSE_RULES.sampleIntervalMs
      ) {
        lastSampleAt = now
        lastTimestamp = Math.max(Math.round(now), lastTimestamp + 1)
        const startedAt = performance.now()
        try {
          const result = detector.detectForVideo(video, lastTimestamp)
          const inferenceMs = performance.now() - startedAt
          slowFrames = inferenceMs > POSE_RULES.maxInferenceMs ? slowFrames + 1 : 0
          if (slowFrames >= POSE_RULES.slowInferenceFrames) {
            fail('Пристрій не встигає перевіряти кадри. Запис можна почати вручну.')
            return
          }
          const luminance = meanLuminance(video, context, canvas.width, canvas.height)
          samples.push(toPoseSample(result, luminance))
          if (samples.length > POSE_RULES.historyFrames) samples.shift()
          setStored({
            stream,
            value: {
              status: 'active',
              ...assessPoseWindow(samples, bodyParts),
            },
          })
        } catch (reason: unknown) {
          fail('Підказки тимчасово недоступні. Запис можна почати вручну.', reason)
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
        detector = await PoseLandmarkerTask.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: POSE_MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 2,
          outputSegmentationMasks: false,
        })
        if (disposed) {
          detector.close()
          detector = null
          return
        }
        animationFrame = window.requestAnimationFrame(detectFrames)
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
  }, [active, bodyParts, stream, video, videoReady])

  if (!active || !stream || !video) return EMPTY_STATE
  if (!videoReady || stored.stream !== stream) return LOADING_STATE
  return stored.value
}
