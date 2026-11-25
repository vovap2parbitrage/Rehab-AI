import {
  BODY_FRAME_LANDMARKS,
  BODY_PART_JOINTS,
  BODY_PART_LABELS,
  JOINT_TRIPLETS,
  POSE_RULES,
  TORSO_TILT,
  TORSO_VISIBILITY_PAIRS,
} from './poseMapping'
import { phrase } from './voicePhrases'

export interface PoseLandmark {
  x: number
  y: number
  visibility: number
}

export interface PoseSample {
  poseCount: number
  landmarks: readonly PoseLandmark[] | null
  meanLuminance: number
}

export interface PoseAssessment {
  hints: string[]
  ready: boolean
}

function isLandmarkVisible(landmarks: readonly PoseLandmark[], index: number): boolean {
  return (landmarks[index]?.visibility ?? 0) >= POSE_RULES.minVisibility
}

function jointVisible(landmarks: readonly PoseLandmark[], joint: string): boolean {
  if (joint === TORSO_TILT) {
    return TORSO_VISIBILITY_PAIRS.some(([shoulder, hip]) => {
      return isLandmarkVisible(landmarks, shoulder) && isLandmarkVisible(landmarks, hip)
    })
  }
  const triplet = JOINT_TRIPLETS[joint as keyof typeof JOINT_TRIPLETS]
  return triplet !== undefined && triplet.every((index) => isLandmarkVisible(landmarks, index))
}

function bodyPartVisible(landmarks: readonly PoseLandmark[], bodyPart: string): boolean {
  const joints = BODY_PART_JOINTS[bodyPart as keyof typeof BODY_PART_JOINTS]
  return joints !== undefined && joints.every((joint) => jointVisible(landmarks, joint))
}

function frameIsClear(landmarks: readonly PoseLandmark[]): boolean {
  return BODY_FRAME_LANDMARKS.every((index) => {
    const landmark = landmarks[index]
    if (landmark === undefined) return false
    if (!isLandmarkVisible(landmarks, index)) return true
    return (
      landmark.x >= POSE_RULES.frameMargin &&
      landmark.x <= 1 - POSE_RULES.frameMargin &&
      landmark.y >= POSE_RULES.frameMargin &&
      landmark.y <= 1 - POSE_RULES.frameMargin
    )
  })
}

function bodyHeight(landmarks: readonly PoseLandmark[]): number | null {
  const nose = landmarks[0]
  const leftAnkle = landmarks[27]
  const rightAnkle = landmarks[28]
  if (
    !nose ||
    !leftAnkle ||
    !rightAnkle ||
    !isLandmarkVisible(landmarks, 0) ||
    !isLandmarkVisible(landmarks, 27) ||
    !isLandmarkVisible(landmarks, 28)
  ) {
    return null
  }
  return Math.max(leftAnkle.y, rightAnkle.y) - nose.y
}

function requiredPartsVisible(sample: PoseSample, bodyParts: readonly string[]): boolean {
  return (
    sample.poseCount === 1 &&
    sample.landmarks !== null &&
    bodyParts.every((bodyPart) => bodyPartVisible(sample.landmarks!, bodyPart))
  )
}

function percentage(samples: readonly PoseSample[], predicate: (sample: PoseSample) => boolean) {
  if (samples.length === 0) return 0
  return (100 * samples.filter(predicate).length) / samples.length
}

const OPPOSITE_PART: Record<string, string> = {
  left_arm: 'right_arm',
  right_arm: 'left_arm',
  left_leg: 'right_leg',
  right_leg: 'left_leg',
}

function partVisiblePct(samples: readonly PoseSample[], bodyPart: string): number {
  return percentage(
    samples,
    (sample) => sample.landmarks !== null && bodyPartVisible(sample.landmarks, bodyPart),
  )
}

/**
 * A side of the body the camera does not see, while it sees the other side, is turned away:
 * the patient should turn that side towards the camera. Otherwise just ask to show the part.
 */
function hiddenPartHint(samples: readonly PoseSample[], bodyPart: string): string {
  const opposite = OPPOSITE_PART[bodyPart]
  if (opposite && partVisiblePct(samples, opposite) >= POSE_RULES.minValidPct) {
    return phrase(
      bodyPart.startsWith('right') ? 'position.turn_right_side' : 'position.turn_left_side',
    )
  }
  return BODY_PART_LABELS[bodyPart as keyof typeof BODY_PART_LABELS]
    ? phrase(`position.show_${bodyPart}`)
    : phrase('position.parts_together')
}

/**
 * Where to step when the body is cut by the left or right edge of the picture. The picture is
 * what the camera sees, so its left is the patient's right when they face the camera; sideways,
 * the edge they face is "forward".
 */
function stepHint(landmarks: readonly PoseLandmark[]): string | null {
  const visible = BODY_FRAME_LANDMARKS.filter((index) => isLandmarkVisible(landmarks, index))
  if (visible.length === 0) return null
  const xs = visible.map((index) => landmarks[index].x)
  const cutLeft = Math.min(...xs) < POSE_RULES.frameMargin
  const cutRight = Math.max(...xs) > 1 - POSE_RULES.frameMargin
  if (cutLeft === cutRight) return null // both sides cut: too close; none: it is the top or bottom
  const towardsPictureRight = cutLeft

  const leftShoulder = landmarks[11]
  const rightShoulder = landmarks[12]
  const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x)
  const torso = Math.abs(
    (leftShoulder.y + rightShoulder.y) / 2 - (landmarks[23].y + landmarks[24].y) / 2,
  )
  // Facing the camera both shoulders are apart; sideways one hides behind the other.
  if (shoulderWidth > 0.25 * torso && shoulderWidth > 0.02) {
    // Facing the camera, the patient's right shoulder is on the left of the picture.
    const facingCamera = rightShoulder.x < leftShoulder.x
    const stepToPatientsLeft = towardsPictureRight === facingCamera
    return phrase(stepToPatientsLeft ? 'position.step_left' : 'position.step_right')
  }
  const facesPictureRight = landmarks[0].x > (leftShoulder.x + rightShoulder.x) / 2
  return phrase(
    facesPictureRight === towardsPictureRight ? 'position.step_forward' : 'position.step_back',
  )
}

const CORE_LANDMARKS = [11, 12, 23, 24] // shoulders and hips
/** A real person in the picture is at least this tall (a share of the picture height). */
const MIN_PERSON_HEIGHT = 0.15

function looksLikePerson(landmarks: readonly PoseLandmark[]): boolean {
  if (CORE_LANDMARKS.filter((index) => isLandmarkVisible(landmarks, index)).length < 2) {
    return false
  }
  return personSize(landmarks).height >= MIN_PERSON_HEIGHT
}

function personSize(landmarks: readonly PoseLandmark[]): { height: number; area: number } {
  const seen = landmarks.filter((landmark) => landmark.visibility >= POSE_RULES.minVisibility)
  if (seen.length === 0) return { height: 0, area: 0 }
  const xs = seen.map((landmark) => landmark.x)
  const ys = seen.map((landmark) => landmark.y)
  const height = Math.max(...ys) - Math.min(...ys)
  return { height, area: height * (Math.max(...xs) - Math.min(...xs)) }
}

/**
 * The model now and then "finds" a second, ghost person for a frame (a shadow, a picture on the
 * wall, a chair), mostly in poor light. A pose counts as a person only when its shoulders or
 * hips are clearly seen and it is not tiny; the biggest one is the patient.
 */
export function pickPatientPose(poses: readonly (readonly PoseLandmark[])[]): {
  poseCount: number
  landmarks: readonly PoseLandmark[] | null
} {
  const people = poses.filter(looksLikePerson)
  const patient = people.reduce<readonly PoseLandmark[] | null>(
    (biggest, pose) =>
      !biggest || personSize(pose).area > personSize(biggest).area ? pose : biggest,
    null,
  )
  return { poseCount: people.length, landmarks: patient }
}

export function assessPoseWindow(
  samples: readonly PoseSample[],
  bodyParts: readonly string[],
): PoseAssessment {
  const hints: string[] = []
  if (samples.length === 0) return { hints, ready: false }

  // Every check below needs the problem in more than a fifth of the last frames: one bad frame
  // (a moment of a lost or a ghost pose, a flicker of light) must not make the agent speak.
  if (percentage(samples, (sample) => sample.poseCount === 1) < POSE_RULES.minValidPct) {
    const several = samples.filter((sample) => sample.poseCount > 1).length
    const nobody = samples.filter((sample) => sample.poseCount === 0).length
    hints.push(phrase(several > nobody ? 'position.one_person' : 'position.stand_in_front'))
    return { hints, ready: false }
  }

  for (const bodyPart of bodyParts) {
    if (partVisiblePct(samples, bodyPart) < POSE_RULES.minValidPct) {
      const hint = hiddenPartHint(samples, bodyPart)
      if (!hints.includes(hint)) hints.push(hint)
    }
  }

  if (
    bodyParts.length > 0 &&
    percentage(samples, (sample) => requiredPartsVisible(sample, bodyParts)) <
      POSE_RULES.minValidPct &&
    hints.length === 0
  ) {
    hints.push(phrase('position.parts_together'))
  }

  const clearFramePct = percentage(
    samples,
    (sample) => sample.landmarks !== null && frameIsClear(sample.landmarks),
  )
  if (clearFramePct < POSE_RULES.minValidPct) {
    const latest = [...samples].reverse().find((sample) => sample.landmarks !== null)
    hints.push((latest?.landmarks && stepHint(latest.landmarks)) ?? phrase('position.whole_frame'))
  }

  const heights = samples
    .map((sample) => (sample.landmarks ? bodyHeight(sample.landmarks) : null))
    .filter((height): height is number => height !== null)
  const averageHeight =
    heights.length > 0 ? heights.reduce((total, height) => total + height, 0) / heights.length : 0
  const goodDistancePct = percentage(samples, (sample) => {
    const height = sample.landmarks ? bodyHeight(sample.landmarks) : null
    return (
      height !== null && height >= POSE_RULES.minBodyHeight && height <= POSE_RULES.maxBodyHeight
    )
  })
  if (goodDistancePct < POSE_RULES.minValidPct) {
    hints.push(
      averageHeight < POSE_RULES.minBodyHeight
        ? phrase('position.closer')
        : phrase('position.farther'),
    )
  }

  if (
    percentage(samples, (sample) => sample.meanLuminance >= POSE_RULES.minMeanLuminance) <
    POSE_RULES.minValidPct
  ) {
    hints.push(phrase('position.light'))
  }

  return {
    hints,
    ready: samples.length >= POSE_RULES.historyFrames && hints.length === 0,
  }
}
