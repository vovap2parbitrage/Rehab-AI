export const JOINT_LABELS: Record<string, string> = {
  l_elbow: 'Лівий лікоть',
  r_elbow: 'Правий лікоть',
  l_shoulder: 'Ліве плече',
  r_shoulder: 'Праве плече',
  l_hip: 'Ліве стегно',
  r_hip: 'Праве стегно',
  l_knee: 'Ліве коліно',
  r_knee: 'Праве коліно',
  torso_tilt: 'Нахил торса',
}

const DIRECTION_LABELS: Record<string, string> = {
  too_bent: 'надто зігнуто',
  too_straight: 'надто випрямлено',
}

export function jointLabel(joint: string): string {
  return JOINT_LABELS[joint] ?? joint
}

export function directionLabel(direction: string): string {
  return DIRECTION_LABELS[direction] ?? direction
}
