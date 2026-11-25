import { describe, expect, it } from 'vitest'
import {
  correctionClips,
  LiveRepetitionCounter,
  repetitionMessage,
  smoothSeries,
  type LiveReference,
  type RepetitionEvent,
} from './liveRepetitions'

const FRAME_MS = 100

function squat(depth: number, frames: number): number[][] {
  return Array.from({ length: frames }, (_, k) => {
    const dip = Math.sin((Math.PI * k) / (frames - 1))
    return [178 - (178 - depth - 5) * dip, 178 - (178 - depth) * dip]
  })
}

function standing(frames: number): number[][] {
  return Array.from({ length: frames }, () => [178, 178])
}

const reference: LiveReference = {
  joints: ['r_hip', 'r_knee'],
  fps: 10,
  angles: squat(60, 40),
  tolerances: {},
}

/** Plays frames at 10 per second and collects every finished repetition. */
function play(counter: LiveRepetitionCounter, frames: number[][], startMs = 0): RepetitionEvent[] {
  const events: RepetitionEvent[] = []
  frames.forEach((row, k) => {
    const event = counter.push(startMs + k * FRAME_MS, row)
    if (event) events.push(event)
  })
  return events
}

describe('LiveRepetitionCounter', () => {
  it('counts a good repetition and finds nothing to correct', () => {
    const counter = new LiveRepetitionCounter(reference)

    const events = play(counter, [...standing(5), ...squat(60, 40), ...standing(15)])

    expect(events).toHaveLength(1)
    expect(events[0].number).toBe(1)
    expect(events[0].errors).toEqual([])
    expect(events[0].score).toBeGreaterThan(9)
    // Only the count: nothing to correct.
    expect(repetitionMessage(events[0])).toBe('Один.')
  })

  it('points out a squat that is lower than the reference', () => {
    const counter = new LiveRepetitionCounter(reference)

    const [event] = play(counter, [...standing(5), ...squat(35, 36), ...standing(15)])

    expect(event.errors.length).toBeGreaterThan(0)
    expect(event.errors.every((error) => error.direction === 'too_bent')).toBe(true)
    expect(repetitionMessage(event)).toContain('Не згинайте праве коліно так сильно.')
  })

  it('points out a squat that is not deep enough', () => {
    const counter = new LiveRepetitionCounter(reference)

    const [event] = play(counter, [...standing(5), ...squat(100, 36), ...standing(15)])

    expect(repetitionMessage(event)).toContain('Зігніть праве коліно більше.')
  })

  it('numbers the repetitions one after another and judges each on its own', () => {
    const counter = new LiveRepetitionCounter(reference)

    const events = play(counter, [
      ...standing(5),
      ...squat(60, 40),
      ...squat(35, 36),
      ...squat(60, 40),
      ...standing(15),
    ])

    expect(events.map((event) => event.number)).toEqual([1, 2, 3])
    expect(events[0].errors).toEqual([])
    expect(events[1].errors.length).toBeGreaterThan(0)
    expect(events[2].errors).toEqual([])
  })

  it('ignores movement that does not look like the exercise', () => {
    const counter = new LiveRepetitionCounter(reference)
    // The knee dips as in the reference but the hip never moves.
    const odd = squat(60, 40).map(([, knee]) => [178, knee])

    const events = play(counter, [...standing(5), ...odd, ...standing(15)])

    expect(events).toEqual([])
  })

  it('does not count small movements or standing still', () => {
    const counter = new LiveRepetitionCounter(reference)
    const fidget = Array.from({ length: 80 }, (_, k) => [
      178 - 6 * Math.sin(k / 3),
      178 - 8 * Math.sin(k / 3),
    ])

    expect(play(counter, fidget)).toEqual([])
    expect(play(counter, standing(50), 10_000)).toEqual([])
  })

  it('skips frames with an unknown angle instead of breaking', () => {
    const counter = new LiveRepetitionCounter(reference)

    expect(counter.push(0, [Number.NaN, 170])).toBeNull()
    expect(counter.push(100, [170])).toBeNull()
  })

  it('judges against the tolerance of the exercise', () => {
    const strict = new LiveRepetitionCounter({ ...reference, tolerances: { r_knee: 2, r_hip: 2 } })
    const relaxed = new LiveRepetitionCounter({
      ...reference,
      tolerances: { r_knee: 60, r_hip: 60 },
    })
    const movement = [...standing(5), ...squat(50, 38), ...standing(15)]

    const [tight] = play(strict, movement)
    const [loose] = play(relaxed, movement)

    expect(tight.errors.length).toBeGreaterThan(0)
    expect(loose.errors).toEqual([])
  })
})

describe('repetitionMessage', () => {
  const event = (errors: RepetitionEvent['errors']): RepetitionEvent => ({
    number: 3,
    score: 7,
    errors,
  })
  const error = (joint: string, direction: 'too_bent' | 'too_straight', peak: number) => ({
    joint,
    start_s: 0,
    end_s: 1,
    peak_deviation_deg: peak,
    direction,
  })

  it('names the two biggest mistakes, each joint once', () => {
    const message = repetitionMessage(
      event([
        error('r_knee', 'too_bent', 12),
        error('r_knee', 'too_bent', 30),
        error('r_hip', 'too_straight', 20),
        error('torso_tilt', 'too_straight', 11),
      ]),
    )

    expect(message).toBe(
      'Три. Не згинайте праве коліно так сильно. Згинайтеся більше в правому стегні.',
    )
  })

  it('describes the torso by its tilt, not by bending', () => {
    expect(repetitionMessage(event([error('torso_tilt', 'too_straight', 20)]))).toBe(
      'Три. Не нахиляйте тулуб так сильно.',
    )
    expect(repetitionMessage(event([error('torso_tilt', 'too_bent', 20)]))).toBe(
      'Три. Нахиліть тулуб більше.',
    )
  })

  it('speaks of both joints at once when both went wrong the same way', () => {
    expect(
      repetitionMessage(
        event([error('l_elbow', 'too_straight', 15), error('r_elbow', 'too_straight', 25)]),
      ),
    ).toBe('Три. Зігніть руки в ліктях більше.')
    expect(
      repetitionMessage(
        event([error('l_knee', 'too_bent', 15), error('r_knee', 'too_straight', 25)]),
      ),
    ).toBe('Три. Зігніть праве коліно більше. Не згинайте ліве коліно так сильно.')
    expect(
      repetitionMessage(
        event([error('l_shoulder', 'too_bent', 15), error('r_shoulder', 'too_bent', 25)]),
      ),
    ).toBe('Три. Підніміть руки вище.')
  })

  it('has a phrase for every joint and direction the analysis can report', () => {
    const joints = [
      'l_elbow',
      'r_elbow',
      'l_shoulder',
      'r_shoulder',
      'l_hip',
      'r_hip',
      'l_knee',
      'r_knee',
      'torso_tilt',
    ]
    for (const joint of joints) {
      for (const direction of ['too_bent', 'too_straight'] as const) {
        expect(correctionClips([error(joint, direction, 20)])).toHaveLength(1)
      }
    }
  })
})

describe('smoothSeries', () => {
  it('removes a single-frame spike and keeps a slow curve', () => {
    const spiky = [100, 100, 100, 160, 100, 100, 100]
    expect(Math.max(...smoothSeries(spiky))).toBeLessThan(105)
    expect(smoothSeries([1, 2, 3, 4, 5, 6, 7]).map((v) => Math.round(v))).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ])
  })

  it('fills the gaps of frames without a pose', () => {
    const result = smoothSeries([10, 10, Number.NaN, Number.NaN, 10, 10])
    expect(result.every((value) => value === 10)).toBe(true)
  })
})
