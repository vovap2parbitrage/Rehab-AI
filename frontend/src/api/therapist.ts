export interface Patient {
  id: string
  full_name: string
  email: string
  phone: string | null
  note: string | null
  is_archived: boolean
}

export interface Exercise {
  id: string
  name: string
  description: string | null
  reference_video_key: string | null
  joint_tolerances: Record<string, number>
}

export interface Assignment {
  id: string
  patient_id: string
  exercise_id: string
  approaches: number
  repetitions: number
  starts_on: string
  ends_on: string
  is_active: boolean
}
