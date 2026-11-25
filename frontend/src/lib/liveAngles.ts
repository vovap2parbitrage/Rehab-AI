import { JOINT_TRIPLETS, TORSO_TILT } from './poseMapping'
import type { PoseLandmark } from './poseHints'

type Point = readonly [number, number]

/** Angle in degrees (0..180) at b between the rays b->a and b->c. Same as the backend's. */
export function calculateAngle(a: Point, b: Point, c: Point): number {
  const ba = [a[0] - b[0], a[1] - b[1]]
  const bc = [c[0] - b[0], c[1] - b[1]]
  const norm = Math.hypot(ba[0], ba[1]) * Math.hypot(bc[0], bc[1])
  if (norm === 0) return Number.NaN
  const cos = Math.min(1, Math.max(-1, (ba[0] * bc[0] + ba[1] * bc[1]) / norm))
  return (Math.acos(cos) * 180) / Math.PI
}

/** 0 deg = upright, 90 = horizontal; visibility-weighted shoulder and hip midpoints. */
function torsoTilt(points: readonly Point[], visibility: readonly number[]): number {
  const eps = 1e-6
  const mid = (left: number, right: number): Point => {
    const wl = visibility[left] + eps
    const wr = visibility[right] + eps
    return [
      (points[left][0] * wl + points[right][0] * wr) / (wl + wr),
      (points[left][1] * wl + points[right][1] * wr) / (wl + wr),
    ]
  }
  const shoulder = mid(11, 12)
  const hip = mid(23, 24)
  return calculateAngle(shoulder, hip, [hip[0], hip[1] - 1])
}

/**
 * The joint angles of one frame, in the order of `joints`. The backend measures them on pixel
 * coordinates, so the normalised landmarks are scaled by the frame size first.
 */
export function jointAngles(
  landmarks: readonly PoseLandmark[],
  width: number,
  height: number,
  joints: readonly string[],
): number[] {
  const points = landmarks.map((landmark): Point => [landmark.x * width, landmark.y * height])
  const visibility = landmarks.map((landmark) => landmark.visibility)
  return joints.map((joint) => {
    if (joint === TORSO_TILT) return torsoTilt(points, visibility)
    const triplet = JOINT_TRIPLETS[joint as keyof typeof JOINT_TRIPLETS]
    if (!triplet) return Number.NaN
    return calculateAngle(points[triplet[0]], points[triplet[1]], points[triplet[2]])
  })
}
