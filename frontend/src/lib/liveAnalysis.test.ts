import { describe, expect, it } from 'vitest'
import fixture from './liveAnalysis.fixture.json'
import { dtwPath, meanAlignedDistance, penalty, scoreRepetition } from './liveAnalysis'

describe('live copy of the backend analysis', () => {
  it.each(fixture.cases)('gives the same answers as the Python code: $name', (item) => {
    const path = dtwPath(item.patient, fixture.reference)
    expect(path).toEqual(item.path)

    const result = scoreRepetition(
      item.patient,
      fixture.reference,
      path,
      fixture.joints,
      item.tolerances as Record<string, number>,
      item.fps,
      item.offset,
    )

    expect(result.score).toBeCloseTo(item.score, 8)
    for (const joint of fixture.joints) {
      expect(result.jointScores[joint]).toBeCloseTo(
        (item.joint_scores as Record<string, number>)[joint],
        8,
      )
    }
    expect(result.errors).toHaveLength(item.errors.length)
    result.errors.forEach((error, index) => {
      const expected = item.errors[index]
      expect(error.joint).toBe(expected.joint)
      expect(error.direction).toBe(expected.direction)
      expect(error.peak_deviation_deg).toBeCloseTo(expected.peak_deviation_deg, 1)
      expect(error.start_s).toBeCloseTo(expected.start_s, 2)
      expect(error.end_s).toBeCloseTo(expected.end_s, 2)
    })
  })

  it('has a zero penalty inside the tolerance and saturates at twice the tolerance', () => {
    expect(penalty(9, 10)).toBe(0)
    expect(penalty(-15, 10)).toBeCloseTo(0.5)
    expect(penalty(40, 10)).toBe(1)
  })

  it('measures how far apart the aligned frames are', () => {
    const rows = [[1], [2], [3]]
    expect(meanAlignedDistance(rows, rows, dtwPath(rows, rows))).toBe(0)
    expect(meanAlignedDistance([[10]], [[0]], [[0, 0]])).toBe(10)
  })
})
