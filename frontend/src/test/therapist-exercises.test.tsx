import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listExercises, updateExercise, type Exercise } from '../api/therapist'
import type { Page } from '../api/pagination'
import { TherapistExercisesPage } from '../pages/therapist/TherapistExercisesPage'

vi.mock('../api/therapist', () => ({
  createExercise: vi.fn(),
  deleteExercise: vi.fn(),
  listExercises: vi.fn(),
  updateExercise: vi.fn(),
}))

vi.mock('../api/uploads', () => ({
  uploadVideo: vi.fn(),
  deleteUploadedVideo: vi.fn(),
  getExerciseVideoUrl: vi.fn(),
}))

const exercise: Exercise = {
  id: 'exercise-1',
  name: 'Присідання',
  description: null,
  reference_video_key: 'videos/u/' + 'a'.repeat(32) + '.mp4',
  joint_tolerances: {},
  body_parts: ['right_leg'],
  created_by: 'therapist-1',
  version: 2,
  active_assignments: 3,
}

function page(items: Exercise[]): Page<Exercise> {
  return { items, total: items.length, limit: 20, offset: 0 }
}

function renderPage(exercises: Exercise[]) {
  vi.mocked(listExercises).mockResolvedValue(page(exercises))
  return render(
    <MemoryRouter initialEntries={['/therapist/exercises']}>
      <Routes>
        <Route path="/therapist/exercises" element={<TherapistExercisesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(listExercises).mockResolvedValue(page([exercise]))
  vi.mocked(updateExercise).mockImplementation(async (_id, payload) => ({
    ...exercise,
    ...payload,
    version: 3,
  }))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Exercise versions in the library', () => {
  it('shows the version and the active assignments of every exercise', async () => {
    renderPage([exercise])

    expect(await screen.findByText('Версія 2 · активних призначень: 3')).toBeInTheDocument()
  })

  it('offers to apply an edit to active assignments only when there are some', async () => {
    const user = userEvent.setup()
    renderPage([exercise, { ...exercise, id: 'exercise-2', name: 'Випади', active_assignments: 0 }])

    expect(await screen.findByRole('button', { name: 'Змінити Присідання' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Застосувати до активних призначень/)).not.toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Змінити Присідання' }))
    expect(screen.getByLabelText(/Застосувати до активних призначень \(3\)/)).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Скасувати' }))

    await user.click(await screen.findByRole('button', { name: 'Змінити Випади' }))
    expect(screen.queryByLabelText(/Застосувати до активних призначень/)).not.toBeInTheDocument()
  })

  it('keeps the active assignments on their version unless the doctor applies the edit', async () => {
    const user = userEvent.setup()
    renderPage([exercise])

    await user.click(await screen.findByRole('button', { name: 'Змінити Присідання' }))
    await user.click(screen.getByRole('button', { name: 'Зберегти зміни' }))

    expect(updateExercise).toHaveBeenCalledWith(
      'exercise-1',
      expect.objectContaining({ apply_to_active_assignments: false }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Створено версію 3; активні призначення (3) лишились на попередній.',
    )
  })

  it('applies the new version to the active assignments when the doctor chooses to', async () => {
    const user = userEvent.setup()
    renderPage([exercise])

    await user.click(await screen.findByRole('button', { name: 'Змінити Присідання' }))
    await user.click(screen.getByLabelText(/Застосувати до активних призначень/))
    await user.click(screen.getByRole('button', { name: 'Зберегти зміни' }))

    expect(updateExercise).toHaveBeenCalledWith(
      'exercise-1',
      expect.objectContaining({ apply_to_active_assignments: true }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Версію 3 застосовано до активних призначень (3).',
    )
  })

  it('does not mention versions when only the name or description changed', async () => {
    const user = userEvent.setup()
    vi.mocked(updateExercise).mockImplementation(async (_id, payload) => ({
      ...exercise,
      ...payload,
    }))
    renderPage([exercise])

    await user.click(await screen.findByRole('button', { name: 'Змінити Присідання' }))
    await user.click(screen.getByRole('button', { name: 'Зберегти зміни' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Вправу змінено.')
    expect(screen.getByRole('status')).not.toHaveTextContent('версі')
  })
})
