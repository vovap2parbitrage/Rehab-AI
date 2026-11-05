import type { Assignment, Exercise, Patient } from '../api/therapist'

export const MOCK_PATIENT: Patient = {
  id: 'mock-patient-1',
  full_name: 'Олександр Коваленко',
  email: 'oleksandr.kovalenko@example.com',
  phone: '+380 67 123 45 67',
  note: 'Відновлення після травми коліна.',
  is_archived: false,
}

export const MOCK_EXERCISE: Exercise = {
  id: 'mock-exercise-1',
  name: 'Згинання коліна лежачи',
  description: 'Плавно зігнути ногу в коліні та повернути у вихідне положення.',
  reference_video_key: 'mock-knee-flexion.mp4',
  joint_tolerances: {},
}

export const MOCK_ASSIGNMENT: Assignment = {
  id: 'mock-assignment-1',
  patient_id: MOCK_PATIENT.id,
  exercise_id: MOCK_EXERCISE.id,
  approaches: 3,
  repetitions: 12,
  starts_on: '2026-10-01',
  ends_on: '2026-11-01',
  is_active: true,
}
