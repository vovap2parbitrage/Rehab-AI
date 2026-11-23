import {
  BODY_FRAME_LANDMARKS,
  BODY_PART_JOINTS,
  BODY_PART_LABELS,
  JOINT_TRIPLETS,
  POSE_RULES,
  TORSO_TILT,
  TORSO_VISIBILITY_PAIRS,
} from './poseMapping'

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

function visiblePartHint(bodyPart: string): string {
  const label =
    BODY_PART_LABELS[bodyPart as keyof typeof BODY_PART_LABELS] ?? `частину тіла (${bodyPart})`
  return `Покажіть камері ${label}.`
}

export function assessPoseWindow(
  samples: readonly PoseSample[],
  bodyParts: readonly string[],
): PoseAssessment {
  const hints: string[] = []
  if (samples.length === 0) return { hints, ready: false }

  if (samples.some((sample) => sample.poseCount !== 1)) {
    hints.push(
      samples.some((sample) => sample.poseCount > 1)
        ? 'У кадрі має бути лише одна людина.'
        : 'Станьте перед камерою, щоб помічник побачив вас.',
    )
    return { hints, ready: false }
  }

  for (const bodyPart of bodyParts) {
    if (
      percentage(samples, (sample) => {
        return sample.landmarks !== null && bodyPartVisible(sample.landmarks, bodyPart)
      }) < POSE_RULES.minValidPct
    ) {
      hints.push(visiblePartHint(bodyPart))
    }
  }

  if (
    bodyParts.length > 0 &&
    percentage(samples, (sample) => requiredPartsVisible(sample, bodyParts)) <
      POSE_RULES.minValidPct &&
    hints.length === 0
  ) {
    hints.push('Покажіть потрібні частини тіла одночасно.')
  }

  const clearFramePct = percentage(
    samples,
    (sample) => sample.landmarks !== null && frameIsClear(sample.landmarks),
  )
  if (clearFramePct < POSE_RULES.minValidPct) {
    hints.push('Станьте в кадр повністю, залишивши трохи місця навколо себе.')
  }

  const heights = samples
    .map((sample) => (sample.landmarks ? bodyHeight(sample.landmarks) : null))
    .filter((height): height is number => height !== null)
  const averageHeight =
    heights.length > 0 ? heights.reduce((total, height) => total + height, 0) / heights.length : 0
  if (
    samples.some((sample) => {
      if (!sample.landmarks) return true
      const height = bodyHeight(sample.landmarks)
      return (
        height === null || height < POSE_RULES.minBodyHeight || height > POSE_RULES.maxBodyHeight
      )
    })
  ) {
    hints.push(
      averageHeight < POSE_RULES.minBodyHeight
        ? 'Підійдіть трохи ближче до камери.'
        : 'Відійдіть трохи далі від камери.',
    )
  }

  if (samples.some((sample) => sample.meanLuminance < POSE_RULES.minMeanLuminance)) {
    hints.push('Світла замало — увімкніть світло перед собою.')
  }

  return {
    hints,
    ready: samples.length >= POSE_RULES.historyFrames && hints.length === 0,
  }
}
