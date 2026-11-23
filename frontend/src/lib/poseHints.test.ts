import { describe, expect, it } from 'vitest'
import { assessPoseWindow, type PoseLandmark, type PoseSample } from './poseHints'
import { POSE_RULES } from './poseMapping'

function sample(overrides: Partial<PoseSample> = {}): PoseSample {
  const landmarks: PoseLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 1,
  }))
  landmarks[0] = { x: 0.5, y: 0.15, visibility: 1 }
  landmarks[27] = { x: 0.4, y: 0.8, visibility: 1 }
  landmarks[28] = { x: 0.6, y: 0.8, visibility: 1 }
  return { poseCount: 1, landmarks, meanLuminance: 80, ...overrides }
}

describe('assessPoseWindow', () => {
  it('marks a stable, visible setup ready after a two-second window', () => {
    const frames = Array.from({ length: POSE_RULES.historyFrames }, () => sample())

    expect(assessPoseWindow(frames, ['right_leg'])).toEqual({ hints: [], ready: true })
  })

  it('requires selected joints in at least 80% of recent frames', () => {
    const frames = Array.from({ length: POSE_RULES.historyFrames }, () => sample())
    frames.slice(0, 5).forEach((frame) => {
      frame.landmarks![28].visibility = 0.39
    })

    expect(assessPoseWindow(frames, ['right_leg'])).toMatchObject({
      ready: false,
      hints: expect.arrayContaining(['Покажіть камері права нога.']),
    })
  })

  it('does not treat an undetected optional joint as a framing problem', () => {
    const frames = Array.from({ length: POSE_RULES.historyFrames }, () => sample())
    frames.forEach((frame) => {
      frame.landmarks![15].visibility = 0.1
    })

    expect(assessPoseWindow(frames, ['right_leg'])).toEqual({ hints: [], ready: true })
  })

  it('tolerates up to 20% of recent frames near the edge', () => {
    const frames = Array.from({ length: POSE_RULES.historyFrames }, () => sample())
    frames.slice(0, 4).forEach((frame) => {
      frame.landmarks![15].x = 0.02
    })

    expect(assessPoseWindow(frames, [])).toEqual({ hints: [], ready: true })

    frames[4].landmarks![15].x = 0.02
    expect(assessPoseWindow(frames, []).hints).toContain(
      'Станьте в кадр повністю, залишивши трохи місця навколо себе.',
    )
  })

  it('warns about multiple people, framing, and low light', () => {
    expect(assessPoseWindow([sample({ poseCount: 2 })], ['right_leg']).hints).toContain(
      'У кадрі має бути лише одна людина.',
    )

    const edgeLandmarks = sample().landmarks!
    edgeLandmarks[15].x = 0.02
    expect(assessPoseWindow([sample({ landmarks: edgeLandmarks })], []).hints).toContain(
      'Станьте в кадр повністю, залишивши трохи місця навколо себе.',
    )
    expect(assessPoseWindow([sample({ meanLuminance: 20 })], []).hints).toContain(
      'Світла замало — увімкніть світло перед собою.',
    )
  })
})
