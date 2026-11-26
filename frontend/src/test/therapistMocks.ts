import type { Assignment, Exercise, Patient } from '../api/therapist'

export const MOCK_PATIENT: Patient = {
  id: 'mock-patient-1',
  user_id: 'mock-user-1',
  therapist_ids: ['mock-therapist-1'],
  first_name: 'Олександр',
  last_name: 'Коваленко',
  date_of_birth: null,
  notes: 'Відновлення після травми коліна.',
  archived_at: null,
}

export const MOCK_EXERCISE: Exercise = {
  id: 'mock-exercise-1',
  name: 'Згинання коліна лежачи',
  description: 'Плавно зігнути ногу в коліні та повернути у вихідне положення.',
  reference_video_key: 'mock-knee-flexion.mp4',
  joint_tolerances: {},
  body_parts: [],
  created_by: 'mock-therapist-1',
  version: 1,
  active_assignments: 0,
  assignments_total: 0,
  hidden: false,
}

export const MOCK_ASSIGNMENT: Assignment = {
  id: 'mock-assignment-1',
  patient_id: MOCK_PATIENT.id,
  exercise_id: MOCK_EXERCISE.id,
  duration_weeks: 4,
  weekdays: [0, 2, 4],
  repetitions: 12,
  starts_on: '2026-10-01',
  status: 'active',
}
