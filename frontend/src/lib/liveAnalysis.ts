// The live copy of the backend analysis (backend/app/services/comparison/dtw.py and
// scoring.py): the same DTW alignment, tolerances and penalty, so a repetition is judged here
// the way the final analysis will judge it. liveAnalysis.fixture.json is produced by the Python
// code, and backend/tests/test_live_analysis_parity.py and liveAnalysis.test.ts keep both equal.
export const DEFAULT_TOLERANCE = 10
const MIN_ERROR_S = 0.3 // ignore blips shorter than this
const MERGE_GAP_S = 0.2 // glue segments separated by less than this

export type Row = readonly number[]

export interface ErrorSegment {
  joint: string
  start_s: number
  end_s: number
  peak_deviation_deg: number
  direction: 'too_bent' | 'too_straight'
}

export interface RepScore {
  score: number
  jointScores: Record<string, number>
  errors: ErrorSegment[]
}

function distance(a: Row, b: Row): number {
  let sum = 0
  for (let c = 0; c < a.length; c++) sum += (a[c] - b[c]) ** 2
  return Math.sqrt(sum)
}

/** Aligns two sequences of rows (frames x joints); the same walk as the backend's dtw_path. */
export function dtwPath(patient: readonly Row[], reference: readonly Row[]): [number, number][] {
  const n = patient.length
  const m = reference.length
  const acc: number[][] = Array.from({ length: n }, () => new Array<number>(m).fill(Infinity))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const cost = distance(patient[i], reference[j])
      if (i === 0 && j === 0) {
        acc[i][j] = cost
        continue
      }
      acc[i][j] =
        cost +
        Math.min(
          i > 0 ? acc[i - 1][j] : Infinity,
          j > 0 ? acc[i][j - 1] : Infinity,
          i > 0 && j > 0 ? acc[i - 1][j - 1] : Infinity,
        )
    }
  }

  let i = n - 1
  let j = m - 1
  const path: [number, number][] = [[i, j]]
  while (i > 0 || j > 0) {
    const options: [number, number, number][] = []
    if (i > 0 && j > 0) options.push([acc[i - 1][j - 1], i - 1, j - 1])
    if (i > 0) options.push([acc[i - 1][j], i - 1, j])
    if (j > 0) options.push([acc[i][j - 1], i, j - 1])
    // Python's min() on (cost, i, j): the cheapest, and on a tie the smaller i, then j.
    const best = options.reduce((a, b) =>
      b[0] < a[0] || (b[0] === a[0] && (b[1] < a[1] || (b[1] === a[1] && b[2] < a[2]))) ? b : a,
    )
    i = best[1]
    j = best[2]
    path.push([i, j])
  }
  return path.reverse()
}

/** Mean distance (in degrees, over all joints) between the aligned frames. */
export function meanAlignedDistance(
  patient: readonly Row[],
  reference: readonly Row[],
  path: readonly (readonly [number, number])[],
): number {
  let total = 0
  for (const [i, j] of path) total += distance(patient[i], reference[j])
  return total / path.length
}

/** 0 within tolerance, grows linearly, saturates at 1 when |dev| >= 2 * tol. */
export function penalty(dev: number, tol: number): number {
  return Math.min(1, Math.max(0, (Math.abs(dev) - tol) / tol))
}

function findSegments(bad: readonly boolean[]): [number, number][] {
  const segments: [number, number][] = []
  let start: number | null = null
  bad.forEach((flag, k) => {
    if (flag && start === null) {
      start = k
    } else if (!flag && start !== null) {
      segments.push([start, k - 1])
      start = null
    }
  })
  if (start !== null) segments.push([start, bad.length - 1])
  return segments
}

function mergeSegments(
  segments: readonly [number, number][],
  maxGapFrames: number,
  pi: readonly number[],
): [number, number][] {
  const merged: [number, number][] = []
  for (const [a, b] of segments) {
    const last = merged[merged.length - 1]
    if (last && pi[a] - pi[last[1]] <= maxGapFrames) last[1] = b
    else merged.push([a, b])
  }
  return merged
}

export function scoreRepetition(
  patient: readonly Row[],
  reference: readonly Row[],
  path: readonly (readonly [number, number])[],
  joints: readonly string[],
  tolerances: Readonly<Record<string, number>>,
  fps: number,
  offset = 0,
): RepScore {
  const pi = path.map(([i]) => i)
  const dev = path.map(([i, j]) => joints.map((_, c) => patient[i][c] - reference[j][c]))
  const tol = joints.map((joint) => tolerances[joint] ?? DEFAULT_TOLERANCE)
  const pen = dev.map((row) => row.map((value, c) => penalty(value, tol[c])))

  const mean = (values: number[]) => values.reduce((total, v) => total + v, 0) / values.length
  const jointScores: Record<string, number> = {}
  joints.forEach((joint, c) => {
    jointScores[joint] = 10 * (1 - mean(pen.map((row) => row[c])))
  })
  const score = 10 * (1 - mean(pen.flat()))

  const errors: ErrorSegment[] = []
  joints.forEach((joint, c) => {
    const bad = dev.map((row) => Math.abs(row[c]) > tol[c])
    const segments = mergeSegments(findSegments(bad), Math.trunc(MERGE_GAP_S * fps), pi)
    for (const [a, b] of segments) {
      const startFrame = pi[a]
      const endFrame = pi[b]
      if ((endFrame - startFrame + 1) / fps < MIN_ERROR_S) continue
      let k = a
      for (let step = a; step <= b; step++) {
        if (Math.abs(dev[step][c]) > Math.abs(dev[k][c])) k = step
      }
      errors.push({
        joint,
        start_s: Math.round(((offset + startFrame) / fps) * 100) / 100,
        end_s: Math.round(((offset + endFrame) / fps) * 100) / 100,
        peak_deviation_deg: Math.round(Math.abs(dev[k][c]) * 10) / 10,
        direction: dev[k][c] < 0 ? 'too_bent' : 'too_straight',
      })
    }
  })
  errors.sort((a, b) => a.start_s - b.start_s)
  return { score, jointScores, errors }
}
