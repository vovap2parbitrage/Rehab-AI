import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hideExercise,
  restoreExercise,
  updateExercise,
  type Exercise,
  type ScoringOptions,
} from '../api/therapist'
import type { CachedResource } from '../lib/useCachedResource'
import { TherapistExercisesPage } from '../pages/therapist/TherapistExercisesPage'
import type { TherapistWorkspaceResources } from '../pages/therapist/TherapistWorkspaceLayout'

vi.mock('../api/therapist', () => ({
  createExercise: vi.fn(),
  deleteExercise: vi.fn(),
  updateExercise: vi.fn(),
  hideExercise: vi.fn(),
  restoreExercise: vi.fn(),
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
  assignments_total: 5,
  hidden: false,
}

const options: ScoringOptions = {
  joints_by_body_part: {
    left_arm: ['l_shoulder', 'l_elbow'],
    right_arm: ['r_shoulder', 'r_elbow'],
    left_leg: ['l_hip', 'l_knee'],
    right_leg: ['r_hip', 'r_knee'],
    torso: ['torso_tilt'],
  },
  default_tolerance_deg: 10,
  max_tolerance_deg: 90,
}

function makeResource<T>(data: T): CachedResource<T> {
  return {
    data,
    loading: false,
    error: null,
    idle: false,
    load: vi.fn(),
    update: vi.fn(),
    invalidate: vi.fn(),
  } as CachedResource<T>
}

function renderPage(exercises: Exercise[], hidden: Exercise[] = []) {
  const resources = {
    exercises: makeResource(exercises),
    hiddenExercises: makeResource(hidden),
    scoringOptions: makeResource(options),
  }

  render(
    <MemoryRouter initialEntries={['/therapist/exercises']}>
      <Routes>
        <Route element={<Outlet context={resources as unknown as TherapistWorkspaceResources} />}>
          <Route path="/therapist/exercises" element={<TherapistExercisesPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
  return resources
}

beforeEach(() => {
  vi.mocked(updateExercise).mockImplementation(async (_id, payload) => ({
    ...exercise,
    ...payload,
    version: 3,
  }))
  vi.mocked(hideExercise).mockResolvedValue(undefined)
  vi.mocked(restoreExercise).mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Exercise versions in the library', () => {
  it('shows the version and the active assignments of every exercise', () => {
    renderPage([exercise])

    expect(screen.getByText(/Версія 2 · призначень: 5 \(активних:\s*3\)/)).toBeInTheDocument()
  })

  it('offers to apply an edit to active assignments only when there are some', async () => {
    const user = userEvent.setup()
    renderPage([exercise, { ...exercise, id: 'exercise-2', name: 'Випади', active_assignments: 0 }])

    expect(screen.queryByLabelText(/Застосувати до активних призначень/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Змінити Присідання' }))
    expect(screen.getByLabelText(/Застосувати до активних призначень \(3\)/)).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Скасувати' }))

    await user.click(screen.getByRole('button', { name: 'Змінити Випади' }))
    expect(screen.queryByLabelText(/Застосувати до активних призначень/)).not.toBeInTheDocument()
  })

  it('keeps the active assignments on their version unless the doctor applies the edit', async () => {
    const user = userEvent.setup()
    renderPage([exercise])

    await user.click(screen.getByRole('button', { name: 'Змінити Присідання' }))
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

    await user.click(screen.getByRole('button', { name: 'Змінити Присідання' }))
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

    await user.click(screen.getByRole('button', { name: 'Змінити Присідання' }))
    await user.click(screen.getByRole('button', { name: 'Зберегти зміни' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Вправу змінено.')
    expect(screen.getByRole('status')).not.toHaveTextContent('версі')
  })
})

describe('Joint tolerances in the exercise form', () => {
  const withTolerances: Exercise = {
    ...exercise,
    body_parts: ['right_leg', 'torso'],
    joint_tolerances: { r_knee: 5, torso_tilt: 3 },
  }

  it('shows a field for each joint of the chosen body parts, filled with what is saved', async () => {
    const user = userEvent.setup()
    renderPage([withTolerances])

    await user.click(screen.getByRole('button', { name: 'Змінити Присідання' }))

    expect(screen.getByLabelText('Праве коліно')).toHaveValue(5)
    expect(screen.getByLabelText('Нахил торса')).toHaveValue(3)
    expect(screen.getByLabelText('Праве стегно')).toHaveValue(null)
    expect(screen.getByLabelText('Праве стегно')).toHaveAttribute('placeholder', '10')
    expect(screen.queryByLabelText('Ліве коліно')).not.toBeInTheDocument()
  })

  it('saves the typed tolerances as numbers and leaves empty fields out', async () => {
    const user = userEvent.setup()
    renderPage([withTolerances])

    await user.click(screen.getByRole('button', { name: 'Змінити Присідання' }))
    const hip = screen.getByLabelText('Праве стегно')
    await user.type(hip, '7.5')
    await user.clear(screen.getByLabelText('Нахил торса'))
    await user.click(screen.getByRole('button', { name: 'Зберегти зміни' }))

    expect(updateExercise).toHaveBeenCalledWith(
      'exercise-1',
      expect.objectContaining({ joint_tolerances: { r_knee: 5, r_hip: 7.5 } }),
    )
  })

  it('drops the tolerances of a body part that is unticked', async () => {
    const user = userEvent.setup()
    renderPage([withTolerances])

    await user.click(screen.getByRole('button', { name: 'Змінити Присідання' }))
    await user.click(screen.getByRole('checkbox', { name: 'Тулуб' }))

    expect(screen.queryByLabelText('Нахил торса')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Зберегти зміни' }))

    expect(updateExercise).toHaveBeenCalledWith(
      'exercise-1',
      expect.objectContaining({ joint_tolerances: { r_knee: 5 } }),
    )
  })

  it('does not save a tolerance outside the allowed range', async () => {
    const user = userEvent.setup()
    renderPage([withTolerances])

    await user.click(screen.getByRole('button', { name: 'Змінити Присідання' }))
    const knee = screen.getByLabelText('Праве коліно')
    await user.clear(knee)
    await user.type(knee, '120')
    // A real browser stops this with its own range check; submit directly to test our guard.
    fireEvent.submit(knee.closest('form') as HTMLFormElement)

    expect(await screen.findByText('Допуск має бути числом від 1 до 90.')).toBeInTheDocument()
    expect(updateExercise).not.toHaveBeenCalled()
  })
})

describe('Hiding exercises', () => {
  it('hides an exercise and tells where to find it again', async () => {
    const user = userEvent.setup()
    const resources = renderPage([exercise])

    await user.click(screen.getByRole('button', { name: 'Приховати Присідання' }))

    expect(hideExercise).toHaveBeenCalledWith('exercise-1')
    expect(await screen.findByRole('status')).toHaveTextContent('Приховані вправи')
    expect(resources.exercises.update).toHaveBeenCalled()
    expect(resources.hiddenExercises.invalidate).toHaveBeenCalled()
  })

  it('opens the hidden exercises and brings one back', async () => {
    const user = userEvent.setup()
    const hidden = { ...exercise, id: 'exercise-9', name: 'Випади', hidden: true }
    const resources = renderPage([exercise], [hidden])

    await user.click(screen.getByRole('button', { name: 'Приховані вправи (1)' }))
    expect(screen.getByRole('heading', { name: 'Приховані вправи (1)' })).toBeInTheDocument()
    expect(screen.getByText('Випади')).toBeInTheDocument()
    expect(screen.queryByText('Присідання')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Повернути' }))

    expect(restoreExercise).toHaveBeenCalledWith('exercise-9')
    expect(await screen.findByRole('status')).toHaveTextContent('повернуто до бібліотеки')
    expect(resources.hiddenExercises.update).toHaveBeenCalled()
    expect(resources.exercises.invalidate).toHaveBeenCalled()
  })

  it('shows a message when nothing is hidden', async () => {
    const user = userEvent.setup()
    renderPage([exercise])

    await user.click(screen.getByRole('button', { name: 'Приховані вправи (0)' }))

    expect(screen.getByText('Прихованих вправ немає.')).toBeInTheDocument()
  })

  it('goes back to the library from the hidden exercises', async () => {
    const user = userEvent.setup()
    renderPage([exercise])

    await user.click(screen.getByRole('button', { name: 'Приховані вправи (0)' }))
    await user.click(screen.getByRole('button', { name: 'Показати бібліотеку' }))

    expect(screen.getByText('Присідання')).toBeInTheDocument()
  })

  it('does not offer to delete an exercise that is used in assignments', () => {
    renderPage([exercise, { ...exercise, id: 'exercise-2', name: 'Випади', assignments_total: 0 }])

    expect(screen.getByRole('button', { name: 'Видалити Присідання' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Видалити Присідання' })).toHaveAttribute(
      'title',
      expect.stringContaining('Її можна приховати'),
    )
    expect(screen.getByRole('button', { name: 'Видалити Випади' })).toBeEnabled()
  })
})
