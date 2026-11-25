// Keep in sync with backend/app/services/comparison/angles.py and pipeline.py;
// backend/tests/test_pose_mapping.py checks parity.
export const JOINT_TRIPLETS = {
  l_elbow: [11, 13, 15],
  r_elbow: [12, 14, 16],
  l_shoulder: [23, 11, 13],
  r_shoulder: [24, 12, 14],
  l_hip: [11, 23, 25],
  r_hip: [12, 24, 26],
  l_knee: [23, 25, 27],
  r_knee: [24, 26, 28],
} as const satisfies Record<string, readonly [number, number, number]>

export const TORSO_TILT = 'torso_tilt'
export const TORSO_VISIBILITY_PAIRS = [
  [11, 23],
  [12, 24],
] as const

export const BODY_PART_JOINTS = {
  left_arm: ['l_shoulder', 'l_elbow'],
  right_arm: ['r_shoulder', 'r_elbow'],
  left_leg: ['l_hip', 'l_knee'],
  right_leg: ['r_hip', 'r_knee'],
  torso: [TORSO_TILT],
} as const satisfies Record<string, readonly string[]>

// As said in "Покажіть камері …".
export const BODY_PART_LABELS: Record<keyof typeof BODY_PART_JOINTS, string> = {
  left_arm: 'ліву руку',
  right_arm: 'праву руку',
  left_leg: 'ліву ногу',
  right_leg: 'праву ногу',
  torso: 'тулуб',
}

export const POSE_RULES = {
  minVisibility: 0.4,
  minValidPct: 80,
  historyFrames: 20,
  sampleIntervalMs: 100,
  frameMargin: 0.05,
  minBodyHeight: 0.4,
  maxBodyHeight: 0.9,
  minMeanLuminance: 45,
  maxInferenceMs: 100,
  slowInferenceFrames: 5,
  // Pace of the checks. The CPU is slower, so it looks at a frame less often.
  cpuSampleIntervalMs: 200,
  maxSampleIntervalMs: 500,
  // A check this slow freezes the page, so the assistant stops instead of slowing the recording.
  hopelessInferenceMs: 400,
  hopelessInferenceFrames: 3,
} as const

export const BODY_FRAME_LANDMARKS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28] as const
