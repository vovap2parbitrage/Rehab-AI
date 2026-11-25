import { describe, expect, it } from 'vitest'
import fixture from './liveRepetitions.videos.fixture.json'
import { LiveRepetitionCounter, repetitionMessage, type RepetitionEvent } from './liveRepetitions'

// Real frames of backend/tests/data videos (pose and angles taken by the backend's own code,
// about 10 per second as in the browser), with what the final analysis said about each video.
const reference = { ...fixture.reference, tolerances: {} }

function play(name: 'patient_good' | 'patient_bad'): RepetitionEvent[] {
  const counter = new LiveRepetitionCounter(reference)
  const events: RepetitionEvent[] = []
  for (const [timeMs, angles] of fixture.videos[name].frames as [number, number[]][]) {
    const event = counter.push(timeMs, angles)
    if (event) events.push(event)
  }
  const last = counter.finish()
  if (last) events.push(last)
  return events
}

const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length

describe('live counting on real recordings', () => {
  it.each(['patient_good', 'patient_bad'] as const)(
    'counts as many repetitions as the final analysis of %s',
    (name) => {
      expect(play(name)).toHaveLength(fixture.videos[name].backend.repetitions)
    },
  )

  it.each(['patient_good', 'patient_bad'] as const)(
    'scores %s close to the final analysis',
    (name) => {
      const scores = play(name).map((event) => event.score)
      expect(Math.abs(mean(scores) - fixture.videos[name].backend.score)).toBeLessThan(0.5)
    },
  )

  it('names mistakes in its spoken messages when the analysis found some', () => {
    const messages = play('patient_bad').map(repetitionMessage)
    expect(messages[0]).toMatch(/^Один\. (Не згин|Зігніть|Згинайтеся)/)
  })
})
