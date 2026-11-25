import { useCallback, useEffect, useRef, useState } from 'react'
import { getLiveReference } from '../api/liveReference'
import { jointAngles } from './liveAngles'
import { LiveRepetitionCounter, repetitionSpeech, type LiveReference } from './liveRepetitions'
import type { PoseFrame } from './usePoseAssistant'

export type LiveReferenceState =
  | { status: 'idle' | 'loading' | 'unavailable'; reference: null }
  | { status: 'ready'; reference: LiveReference }

const cache = new Map<string, LiveReference>()

/** Fetches the reference angles of the assignment once the camera is on. */
export function useLiveReference(assignmentId: string, enabled: boolean): LiveReferenceState {
  const [state, setState] = useState<LiveReferenceState & { id: string }>({
    id: assignmentId,
    status: 'idle',
    reference: null,
  })

  useEffect(() => {
    if (!enabled || cache.has(assignmentId)) return
    const controller = new AbortController()
    // The first patient of a new exercise version waits a few seconds while it is worked out.
    getLiveReference(assignmentId, { signal: controller.signal })
      .then((reference) => {
        cache.set(assignmentId, reference)
        setState({ id: assignmentId, status: 'ready', reference })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ id: assignmentId, status: 'unavailable', reference: null })
        }
      })
    return () => controller.abort()
  }, [assignmentId, enabled])

  const cached = cache.get(assignmentId)
  if (cached) return { status: 'ready', reference: cached }
  if (!enabled) return { status: 'idle', reference: null }
  if (state.id !== assignmentId || state.status === 'idle')
    return { status: 'loading', reference: null }
  return state
}

export interface RepetitionFeedback {
  number: number
  message: string
  /** The recorded phrases that say `message`. */
  clips: string[]
  mistakes: number
}

export interface LiveRepetitions {
  count: number
  feedback: RepetitionFeedback | null
  /** Feeds the frame the pose assistant has just looked at. */
  onFrame: (frame: PoseFrame) => void
}

/** Counts the repetitions of the recording and judges each one as soon as it is finished. */
export function useLiveRepetitions(
  reference: LiveReference | null,
  active: boolean,
): LiveRepetitions {
  const [result, setResult] = useState<{ count: number; feedback: RepetitionFeedback | null }>({
    count: 0,
    feedback: null,
  })
  const counter = useRef<{ owner: LiveReference | null; instance: LiveRepetitionCounter | null }>({
    owner: null,
    instance: null,
  })
  const startedAt = useRef<number | null>(null)

  useEffect(() => {
    if (!active) {
      counter.current = { owner: null, instance: null }
      startedAt.current = null
    }
  }, [active])

  const onFrame = useCallback(
    (frame: PoseFrame) => {
      if (!active || !reference || frame.poseCount !== 1 || !frame.landmarks) return
      let instance = counter.current.owner === reference ? counter.current.instance : null
      if (!instance) {
        instance = new LiveRepetitionCounter(reference)
        counter.current = { owner: reference, instance }
        startedAt.current = frame.timeMs
        setResult({ count: 0, feedback: null })
      }
      const angles = jointAngles(frame.landmarks, frame.width, frame.height, reference.joints)
      const event = instance.push(frame.timeMs - (startedAt.current ?? 0), angles)
      if (event) {
        const speech = repetitionSpeech(event)
        setResult({
          count: event.number,
          feedback: {
            number: event.number,
            message: speech.text,
            clips: speech.clips,
            mistakes: event.errors.length,
          },
        })
      }
    },
    [active, reference],
  )

  return { ...result, onFrame }
}
