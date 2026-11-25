import { describe, expect, it } from 'vitest'
import { assessPoseWindow, pickPatientPose, type PoseLandmark, type PoseSample } from './poseHints'
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
      // The left leg is seen, so the right side is turned away from the camera.
      hints: expect.arrayContaining(['Поверніться трохи правим боком до камери.']),
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
    expect(assessPoseWindow(frames, []).hints).toHaveLength(1)
  })

  it('warns about multiple people, framing, and low light', () => {
    expect(assessPoseWindow([sample({ poseCount: 2 })], ['right_leg']).hints).toContain(
      'У кадрі має бути лише одна людина.',
    )

    const cutTopAndBottom = sample().landmarks!
    cutTopAndBottom[0].y = 0.01
    expect(assessPoseWindow([sample({ landmarks: cutTopAndBottom })], []).hints).toContain(
      'Станьте в кадр повністю, залишивши трохи місця навколо себе.',
    )
    expect(assessPoseWindow([sample({ meanLuminance: 20 })], []).hints).toContain(
      'Світла замало — увімкніть світло перед собою.',
    )
  })

  it('asks to show a body part when neither side of it is seen', () => {
    const frames = Array.from({ length: POSE_RULES.historyFrames }, () => sample())
    frames.forEach((frame) => {
      frame.landmarks![27].visibility = 0.1
      frame.landmarks![28].visibility = 0.1
    })

    expect(assessPoseWindow(frames, ['right_leg']).hints).toContain('Покажіть камері праву ногу.')
  })

  it('tells a patient facing the camera which way to step, from their own side', () => {
    const landmarks = [...sample().landmarks!]
    // Facing the camera: the right shoulder (12) is on the left of the picture.
    landmarks[11] = { x: 0.55, y: 0.3, visibility: 1 }
    landmarks[12] = { x: 0.45, y: 0.3, visibility: 1 }
    landmarks[23] = { x: 0.55, y: 0.55, visibility: 1 }
    landmarks[24] = { x: 0.45, y: 0.55, visibility: 1 }
    landmarks[15] = { ...landmarks[15], x: 0.02 } // cut by the left edge of the picture: they must go to their left

    expect(assessPoseWindow([sample({ landmarks })], []).hints).toContain('Зробіть крок ліворуч.')
  })

  it('tells a patient standing sideways to step forward or back', () => {
    const landmarks = [...sample().landmarks!]
    landmarks[0] = { x: 0.6, y: 0.15, visibility: 1 } // faces the right of the picture
    landmarks[16] = { ...landmarks[16], x: 0.98 } // cut by the edge in front of them

    expect(assessPoseWindow([sample({ landmarks })], []).hints).toContain('Зробіть крок назад.')
  })

  it('is not bothered by a single frame with a ghost person, no person or a dark flicker', () => {
    const frames = Array.from({ length: POSE_RULES.historyFrames }, () => sample())
    frames[3] = sample({ poseCount: 2 })
    frames[9] = sample({ poseCount: 0, landmarks: null })
    frames[14] = sample({ meanLuminance: 10 })

    expect(assessPoseWindow(frames, ['right_leg'])).toEqual({ hints: [], ready: true })
  })

  it('speaks up when the problem lasts', () => {
    const several = Array.from({ length: POSE_RULES.historyFrames }, (_, k) =>
      sample({ poseCount: k < 10 ? 2 : 1 }),
    )
    const nobody = Array.from({ length: POSE_RULES.historyFrames }, (_, k) =>
      k < 10 ? sample({ poseCount: 0, landmarks: null }) : sample(),
    )

    expect(assessPoseWindow(several, []).hints).toEqual(['У кадрі має бути лише одна людина.'])
    expect(assessPoseWindow(nobody, []).hints).toEqual([
      'Я вас не бачу. Станьте перед камерою так, щоб вас було видно повністю.',
    ])
  })
})

describe('pickPatientPose', () => {
  const person = (scale = 1, visibility = 1): PoseLandmark[] =>
    Array.from({ length: 33 }, (_, index) => ({
      x: 0.5 + (index % 2 ? 0.05 : -0.05) * scale,
      y: 0.2 + (index / 33) * 0.6 * scale,
      visibility,
    }))

  it('counts a faint or tiny extra pose as nobody', () => {
    const patient = person()

    expect(pickPatientPose([patient, person(1, 0.1)])).toEqual({ poseCount: 1, landmarks: patient })
    expect(pickPatientPose([person(0.1), patient])).toEqual({ poseCount: 1, landmarks: patient })
  })

  it('takes the biggest of two real people as the patient, and counts both', () => {
    const near = person(1.2)
    const far = person(0.6)

    expect(pickPatientPose([far, near])).toEqual({ poseCount: 2, landmarks: near })
  })

  it('finds nobody in an empty picture', () => {
    expect(pickPatientPose([])).toEqual({ poseCount: 0, landmarks: null })
  })
})
