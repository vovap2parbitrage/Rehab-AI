import { phraseText, VOICE_PHRASES } from './voicePhrases'
import {
  DEFAULT_TOLERANCE,
  dtwPath,
  meanAlignedDistance,
  scoreRepetition,
  type ErrorSegment,
  type Row,
} from './liveAnalysis'

export interface LiveReference {
  joints: string[]
  fps: number
  /** One row per reference frame, one angle per joint (in `joints` order). */
  angles: number[][]
  tolerances: Record<string, number>
}

// Counting, the same way the backend splits a video (repetitions.py): a repetition is a dip of
// the main joint at least this deep.
const MIN_DEPTH_DEG = 25
// A repetition is over when the joint stops rising: it starts to fall again, or stays put.
const REP_END_DROP_DEG = 6
const REP_END_IDLE_MS = 800
const MIN_REP_MS = 800
// A movement counts only when it looks like the reference: the mean gap between the aligned
// frames (DTW) stays below this. Anything else (turning, stretching, walking away) is ignored.
const MAX_MEAN_DEVIATION_DEG = 45
// The analysis marks a mistake only where a joint is off for a while. A squat that is simply too
// shallow passes the reference's deepest point in an instant, so it lowers the score without a
// marked mistake; for the voice such a joint (score below this) is reported as not bent enough.
const LOW_JOINT_SCORE = 8

export interface RepetitionEvent {
  /** Number of the repetition, counting only the ones that matched the reference. */
  number: number
  score: number
  errors: ErrorSegment[]
}

function fillNaNs(values: readonly number[]): number[] {
  const known = values
    .map((value, index) => (Number.isNaN(value) ? -1 : index))
    .filter((i) => i >= 0)
  if (known.length === 0) return [...values]
  return values.map((value, index) => {
    if (!Number.isNaN(value)) return value
    const before = [...known].reverse().find((i) => i < index)
    const after = known.find((i) => i > index)
    if (before === undefined) return values[after as number]
    if (after === undefined) return values[before]
    const t = (index - before) / (after - before)
    return values[before] + t * (values[after] - values[before])
  })
}

/**
 * Median of 3, then a 5-point Savitzky-Golay (the backend uses wider windows because its video
 * has about three times the frames per second of this live sequence).
 */
export function smoothSeries(values: readonly number[]): number[] {
  const filled = fillNaNs(values)
  const last = filled.length - 1
  const median = filled.map((_, i) => {
    const trio = [filled[Math.max(0, i - 1)], filled[i], filled[Math.min(last, i + 1)]]
    return trio.sort((a, b) => a - b)[1]
  })
  if (median.length < 5) return median
  return median.map((value, i) => {
    if (i < 2 || i > last - 2) return value
    return (
      (-3 * median[i - 2] +
        12 * median[i - 1] +
        17 * value +
        12 * median[i + 1] -
        3 * median[i + 2]) /
      35
    )
  })
}

type Phase = 'up' | 'down' | 'rising'

/**
 * Follows the main joint of the exercise while the patient moves and judges each repetition the
 * moment it is finished, with the same alignment and tolerances as the final analysis.
 */
export class LiveRepetitionCounter {
  private readonly main: number
  private times: number[] = []
  private rows: number[][] = []
  private phase: Phase = 'up'
  private top = { value: -Infinity, index: 0 }
  private low = { value: Infinity, index: 0 }
  private peak = { value: -Infinity, index: 0, time: 0 }
  private count = 0
  private readonly reference: LiveReference

  constructor(reference: LiveReference) {
    this.reference = reference
    const range = reference.joints.map((_, c) => {
      const column = reference.angles.map((row) => row[c])
      return Math.max(...column) - Math.min(...column)
    })
    this.main = range.indexOf(Math.max(...range))
  }

  /** Feeds one frame (milliseconds, one angle per joint); returns the repetition it finished. */
  push(timeMs: number, angles: Row): RepetitionEvent | null {
    if (angles.length !== this.reference.joints.length || angles.some(Number.isNaN)) return null
    this.times.push(timeMs)
    this.rows.push([...angles])
    const index = this.rows.length - 1
    const signal = smoothSeries(this.rows.map((row) => row[this.main]))
    const value = signal[index]

    if (this.phase === 'up') {
      if (value > this.top.value) this.top = { value, index }
      if (this.top.value - value >= MIN_DEPTH_DEG) {
        this.phase = 'down'
        this.low = { value, index }
      }
    } else if (this.phase === 'down') {
      if (value < this.low.value) this.low = { value, index }
      if (value - this.low.value >= MIN_DEPTH_DEG) {
        this.phase = 'rising'
        this.peak = { value, index, time: timeMs }
      }
    } else {
      if (value > this.peak.value) this.peak = { value, index, time: timeMs }
      const falling = this.peak.value - value >= REP_END_DROP_DEG
      const resting = timeMs - this.peak.time >= REP_END_IDLE_MS
      if (falling || resting) return this.finishRepetition()
    }
    return null
  }

  /** Closes a repetition that was still rising when the frames stopped (the end of a video). */
  finish(): RepetitionEvent | null {
    return this.phase === 'rising' ? this.finishRepetition() : null
  }

  private finishRepetition(): RepetitionEvent | null {
    const start = this.top.index
    const end = this.peak.index
    const columns = this.reference.joints.map((_, c) => smoothSeries(this.rows.map((r) => r[c])))
    const segment: number[][] = []
    for (let i = start; i <= end; i++) segment.push(columns.map((column) => column[i]))
    const seconds = (this.times[end] - this.times[start]) / 1000

    // The next repetition starts from this one's top.
    const peak = this.peak
    this.times = this.times.slice(end)
    this.rows = this.rows.slice(end)
    this.top = { value: peak.value, index: 0 }
    this.peak = { ...peak, index: 0 }
    this.phase = 'up'

    if (segment.length < 4 || seconds * 1000 < MIN_REP_MS) return null
    const path = dtwPath(segment, this.reference.angles)
    if (meanAlignedDistance(segment, this.reference.angles, path) > MAX_MEAN_DEVIATION_DEG) {
      return null
    }
    const fps = (segment.length - 1) / seconds
    const result = scoreRepetition(
      segment,
      this.reference.angles,
      path,
      this.reference.joints,
      this.reference.tolerances,
      fps,
    )
    this.count += 1
    return {
      number: this.count,
      score: result.score,
      errors: [...result.errors, ...this.notBentEnough(segment, result, seconds)],
    }
  }

  /** Joints that never reached the reference's deepest bend (by more than the tolerance). */
  private notBentEnough(
    segment: readonly Row[],
    result: { jointScores: Record<string, number>; errors: ErrorSegment[] },
    seconds: number,
  ): ErrorSegment[] {
    const extra: ErrorSegment[] = []
    this.reference.joints.forEach((joint, c) => {
      if (result.errors.some((error) => error.joint === joint)) return
      if (result.jointScores[joint] >= LOW_JOINT_SCORE) return
      const patientLow = Math.min(...segment.map((row) => row[c]))
      const referenceLow = Math.min(...this.reference.angles.map((row) => row[c]))
      const gap = patientLow - referenceLow
      if (gap <= (this.reference.tolerances[joint] ?? DEFAULT_TOLERANCE)) return
      extra.push({
        joint,
        start_s: 0,
        end_s: Math.round(seconds * 100) / 100,
        peak_deviation_deg: Math.round(gap * 10) / 10,
        direction: 'too_straight',
      })
    })
    return extra
  }
}

export interface RepetitionSpeech {
  /** Ids of the recorded phrases to play one after another (see voicePhrases.json). */
  clips: string[]
  text: string
}

/** l_knee -> knee/l; torso_tilt -> torso. */
function jointGroup(joint: string): { group: string; side: 'l' | 'r' | null } {
  if (joint === 'torso_tilt') return { group: 'torso', side: null }
  const [side, group] = joint.split('_')
  return { group, side: side === 'l' ? 'l' : 'r' }
}

/**
 * The corrections for one repetition, as phrase ids: one per joint (its biggest deviation), the
 * left and right joint merged into one phrase when both went wrong the same way ("Зігніть коліна
 * більше"), the biggest first.
 */
export function correctionClips(errors: readonly ErrorSegment[], max = 2): string[] {
  const worst = new Map<string, ErrorSegment>()
  for (const error of errors) {
    const known = worst.get(error.joint)
    if (!known || error.peak_deviation_deg > known.peak_deviation_deg) worst.set(error.joint, error)
  }
  const fixes = new Map<string, number>()
  const add = (id: string, peak: number) => fixes.set(id, Math.max(peak, fixes.get(id) ?? 0))
  for (const error of worst.values()) {
    const { group, side } = jointGroup(error.joint)
    if (side === null) {
      add(`fix.${group}.${error.direction}`, error.peak_deviation_deg)
      continue
    }
    const other = worst.get(`${side === 'l' ? 'r' : 'l'}_${group}`)
    if (other && other.direction === error.direction) {
      add(
        `fix.${group}.both.${error.direction}`,
        Math.max(error.peak_deviation_deg, other.peak_deviation_deg),
      )
    } else {
      add(`fix.${group}.${side}.${error.direction}`, error.peak_deviation_deg)
    }
  }
  return [...fixes.entries()]
    .filter(([id]) => id in VOICE_PHRASES)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([id]) => id)
}

/** After a repetition: its number, then what to correct. Nothing more when it was right. */
export function repetitionSpeech(event: RepetitionEvent): RepetitionSpeech {
  const number = `count.${event.number}`
  const clips = [...(number in VOICE_PHRASES ? [number] : []), ...correctionClips(event.errors)]
  return { clips, text: phraseText(clips) }
}

export function repetitionMessage(event: RepetitionEvent): string {
  return repetitionSpeech(event).text
}
