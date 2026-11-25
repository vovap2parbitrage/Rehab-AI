import { describe, expect, it } from 'vitest'
import { calculateAngle, jointAngles } from './liveAngles'
import type { PoseLandmark } from './poseHints'

function landmarks(overrides: Record<number, [number, number]> = {}): PoseLandmark[] {
  const list: PoseLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }))
  for (const [index, [x, y]] of Object.entries(overrides)) {
    list[Number(index)] = { x, y, visibility: 1 }
  }
  return list
}

describe('joint angles', () => {
  it('measures a right angle and a straight line', () => {
    expect(calculateAngle([1, 0], [0, 0], [0, 1])).toBeCloseTo(90)
    expect(calculateAngle([-1, 0], [0, 0], [1, 0])).toBeCloseTo(180)
    expect(calculateAngle([0, 0], [0, 0], [1, 0])).toBeNaN()
  })

  it('measures the right knee between the hip, knee and ankle', () => {
    // hip (24), knee (26) and ankle (28): the shin points sideways from the thigh.
    const frame = landmarks({ 24: [0.5, 0.4], 26: [0.5, 0.6], 28: [0.7, 0.6] })

    expect(jointAngles(frame, 100, 100, ['r_knee'])[0]).toBeCloseTo(90)
  })

  it('scales the normalised points by the picture size, as the backend does with pixels', () => {
    const frame = landmarks({ 24: [0.5, 0.4], 26: [0.5, 0.6], 28: [0.6, 0.6] })

    // 0.1 wide and 0.2 tall are not the same distance on a wide picture.
    expect(jointAngles(frame, 200, 100, ['r_knee'])[0]).toBeCloseTo(90)
    const square = calculateAngle([50, 40], [50, 60], [60, 60])
    expect(square).toBeCloseTo(90)
  })

  it('reads the torso tilt: 0 when upright, 45 when leaning', () => {
    const upright = landmarks({
      11: [0.45, 0.3],
      12: [0.55, 0.3],
      23: [0.45, 0.6],
      24: [0.55, 0.6],
    })
    const leaning = landmarks({
      11: [0.75, 0.3],
      12: [0.85, 0.3],
      23: [0.45, 0.6],
      24: [0.55, 0.6],
    })

    expect(jointAngles(upright, 100, 100, ['torso_tilt'])[0]).toBeCloseTo(0)
    expect(jointAngles(leaning, 100, 100, ['torso_tilt'])[0]).toBeCloseTo(45)
  })

  it('gives NaN for a joint it does not know', () => {
    expect(jointAngles(landmarks(), 100, 100, ['l_ankle'])[0]).toBeNaN()
  })
})
