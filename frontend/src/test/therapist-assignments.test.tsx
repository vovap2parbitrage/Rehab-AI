import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelAssignment,
  createAssignment,
  getPatient,
  listAssignments,
  listExercises,
  updateAssignment,
  type Assignment,
  type Exercise,
  type Patient,
} from '../api/therapist'
import { ApiError } from '../api/client'
import { getPatientHistory, type PatientHistory } from '../api/history'
import { listPatientHelpRequests } from '../api/helpRequests'
import { listPatientSessions } from '../api/sessions'
import { TherapistPatientPage } from '../pages/therapist/TherapistPatientPage'
import { getLocalDate, nextSessionDate, weekdayOf } from '../lib/assignmentSchedule'

vi.mock('../api/therapist', () => ({
  getPatient: vi.fn(),
  listExercises: vi.fn(),
  listAssignments: vi.fn(),
  createAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  cancelAssignment: vi.fn(),
}))

vi.mock('../api/history', () => ({
  getMyHistory: vi.fn(),
  getPatientHistory: vi.fn(),
}))

vi.mock('../api/helpRequests', () => ({
  listPatientHelpRequests: vi.fn(),
}))

vi.mock('../api/sessions', () => ({
  listPatientSessions: vi.fn(),
  getSessionVideoUrl: vi.fn(),
}))

const patient: Patient = {
  id: 'patient-1',
  user_id: 'user-1',
  therapist_ids: ['therapist-1'],
  first_name: 'Олена',
  last_name: 'Коваль',
  date_of_birth: null,
  notes: null,
  archived_at: null,
}

const exercise: Exercise = {
  id: 'exercise-1',
  name: 'Присідання',
  description: null,
  reference_video_key: null,
  joint_tolerances: {},
  body_parts: ['right_leg'],
  created_by: 'therapist-1',
  version: 1,
  active_assignments: 1,
}

const assignment: Assignment = {
  id: 'assignment-1',
  patient_id: 'patient-1',
  exercise_id: 'exercise-1',
  duration_weeks: 4,
  weekdays: [0, 2, 4],
  repetitions: 12,
  starts_on: '2026-01-01',
  status: 'active',
}

const emptyHistory: PatientHistory = {
  patient_id: 'patient-1',
  period: '30d',
  date_from: '2026-01-01',
  date_to: '2026-01-31',
  kpis: {
    total_sessions: 0,
    planned_sessions: 0,
    adherence_pct: null,
    avg_pain: null,
    pain_trend: null,
    avg_score: null,
    last_session_at: null,
  },
  pain_series: [],
  score_series: [],
  adherence_weeks: [],
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/therapist/patients/patient-1']}>
      <Routes>
        <Route path="/therapist/patients/:patientId" element={<TherapistPatientPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(getPatient).mockResolvedValue(patient)
  vi.mocked(listExercises).mockResolvedValue([exercise])
  vi.mocked(listAssignments).mockResolvedValue([assignment])
  vi.mocked(getPatientHistory).mockResolvedValue(emptyHistory)
  vi.mocked(listPatientHelpRequests).mockResolvedValue([])
  vi.mocked(listPatientSessions).mockResolvedValue([])
  vi.mocked(updateAssignment).mockImplementation(async (_id, payload) => ({
    ...assignment,
    ...payload,
  }))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Editing an assignment', () => {
  it('fills the form with the assignment and saves only through the update call', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Змінити Присідання' }))

    expect(screen.getByRole('heading', { name: 'Змінити призначення' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Повторень/)).toHaveValue(12)
    expect(screen.getByLabelText(/Початок/)).toHaveValue('2026-01-01')
    expect(screen.getByLabelText(/Початок/)).toBeDisabled() // the start date is fixed
    expect(screen.getByLabelText(/Вправа/)).toBeDisabled()

    const repetitions = screen.getByLabelText(/Повторень/)
    await user.clear(repetitions)
    await user.type(repetitions, '20')
    await user.click(screen.getByRole('button', { name: 'Зберегти зміни' }))

    expect(await screen.findByText('Призначення змінено.')).toBeInTheDocument()
    expect(updateAssignment).toHaveBeenCalledWith('assignment-1', {
      duration_weeks: 4,
      weekdays: [0, 2, 4],
      repetitions: 20,
    })
    expect(createAssignment).not.toHaveBeenCalled()
    expect(screen.getByText(/20 повторень/)).toBeInTheDocument()
    // The form is back in the "create" mode.
    expect(screen.getByRole('heading', { name: 'Призначити план' })).toBeInTheDocument()
  })

  it('leaves the edit mode without saving when the doctor cancels', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Змінити Присідання' }))
    await user.click(screen.getByRole('button', { name: 'Скасувати редагування' }))

    expect(screen.getByRole('heading', { name: 'Призначити план' })).toBeInTheDocument()
    expect(updateAssignment).not.toHaveBeenCalled()
  })

  it('keeps the edit mode and shows the error when saving fails', async () => {
    const user = userEvent.setup()
    vi.mocked(updateAssignment).mockRejectedValue(
      new ApiError('Дію неможливо виконати через конфлікт даних.', 'conflict', 409),
    )
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Змінити Присідання' }))
    await user.click(screen.getByRole('button', { name: 'Зберегти зміни' }))

    expect(
      await screen.findByText('Дію неможливо виконати через конфлікт даних.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Змінити призначення' })).toBeInTheDocument()
  })

  it('offers editing only for active assignments', async () => {
    vi.mocked(listAssignments).mockResolvedValue([
      assignment,
      { ...assignment, id: 'assignment-2', status: 'completed' },
      { ...assignment, id: 'assignment-3', status: 'cancelled' },
    ])
    renderPage()

    await screen.findAllByText(/Присідання/)

    expect(screen.getAllByRole('button', { name: 'Змінити Присідання' })).toHaveLength(1)
  })

  it('still creates a new assignment when nothing is being edited', async () => {
    const user = userEvent.setup()
    vi.mocked(createAssignment).mockResolvedValue({ ...assignment, id: 'assignment-9' })
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Призначити план' }))

    expect(createAssignment).toHaveBeenCalledTimes(1)
    // The default start is the first day of the schedule (Mon, Wed, Fri), not just today.
    expect(createAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ starts_on: nextSessionDate(getLocalDate(), [0, 2, 4]) }),
    )
    expect(updateAssignment).not.toHaveBeenCalled()
    expect(cancelAssignment).not.toHaveBeenCalled()
  })
})

describe('Start date of a new assignment', () => {
  const today = getLocalDate()

  const dayOffWeekdays = () => {
    // A date from today on that is not Monday, Wednesday or Friday.
    const day = new Date(`${today}T00:00:00`)
    while ([0, 2, 4].includes(weekdayOf(getLocalDate(day)))) day.setDate(day.getDate() + 1)
    return getLocalDate(day)
  }

  it('starts on the first schedule day and cannot be picked before today', async () => {
    renderPage()

    const input = await screen.findByLabelText(/Початок/)

    expect(input).toHaveValue(nextSessionDate(today, [0, 2, 4]))
    expect(input).toHaveAttribute('min', today)
    expect(screen.getByRole('button', { name: 'Призначити план' })).toBeEnabled()
  })

  it('rejects a date that is not one of the chosen weekdays', async () => {
    renderPage()

    fireEvent.change(await screen.findByLabelText(/Початок/), {
      target: { value: dayOffWeekdays() },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Перше заняття має припадати на один із обраних днів: Пн Ср Пт.',
    )
    expect(screen.getByRole('button', { name: 'Призначити план' })).toBeDisabled()
  })

  it('rejects a date before today', async () => {
    const yesterday = new Date(`${today}T00:00:00`)
    yesterday.setDate(yesterday.getDate() - 1)
    renderPage()

    fireEvent.change(await screen.findByLabelText(/Початок/), {
      target: { value: getLocalDate(yesterday) },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Дата початку не може бути раніше за сьогодні.',
    )
    expect(screen.getByRole('button', { name: 'Призначити план' })).toBeDisabled()
  })
})
