import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatientSession } from '../api/patient'
import { getSessionVideoUrl, listPatientSessions } from '../api/sessions'
import { PatientSessionsCard } from '../components/PatientSessionsCard'

vi.mock('../api/sessions', () => ({
  listPatientSessions: vi.fn(),
  getSessionVideoUrl: vi.fn(),
}))

function makeSession(overrides: Partial<PatientSession>): PatientSession {
  return {
    id: 'session-1',
    assignment_id: 'assignment-1',
    pain_score: 3,
    completed_at: '2026-03-01T10:00:00Z',
    score: 8.5,
    joint_deviations: {
      repetitions: 7,
      joint_scores: { r_knee: 8.1 },
      errors: [
        {
          joint: 'r_knee',
          start_s: 1,
          end_s: 1.5,
          peak_deviation_deg: 18.4,
          direction: 'too_bent',
        },
      ],
    },
    has_video: true,
    created_at: '2026-03-01T10:00:00Z',
    ...overrides,
  }
}

const names: Record<string, string> = {
  'assignment-1': 'Присідання',
  'assignment-2': 'Випади',
}

function renderCard() {
  return render(
    <PatientSessionsCard
      patientId="patient-1"
      exerciseNameFor={(assignmentId) => names[assignmentId] ?? 'Вправа'}
    />,
  )
}

beforeEach(() => {
  vi.mocked(listPatientSessions).mockResolvedValue([makeSession({})])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Sessions of a patient (therapist view)', () => {
  it('loads the sessions of the patient and names each by its exercise and score', async () => {
    renderCard()

    expect(await screen.findByText('Присідання · 8.5 із 10')).toBeInTheDocument()
    expect(listPatientSessions).toHaveBeenCalledWith('patient-1', expect.any(Object))
    expect(screen.getByRole('heading', { name: 'Сесії пацієнта (1)' })).toBeInTheDocument()
  })

  it('lists the newest session first', async () => {
    vi.mocked(listPatientSessions).mockResolvedValue([
      makeSession({
        id: 'old',
        assignment_id: 'assignment-1',
        completed_at: '2026-01-01T10:00:00Z',
      }),
      makeSession({
        id: 'new',
        assignment_id: 'assignment-2',
        completed_at: '2026-03-05T10:00:00Z',
      }),
    ])
    renderCard()

    const titles = (await screen.findAllByText(/ · 8.5 із 10/)).map((node) => node.textContent)

    expect(titles).toEqual(['Випади · 8.5 із 10', 'Присідання · 8.5 із 10'])
  })

  it('shows pain, the analysis details and plays the recorded video', async () => {
    const user = userEvent.setup()
    vi.mocked(getSessionVideoUrl).mockResolvedValue('https://storage.test/session.mp4')
    renderCard()

    await user.click(await screen.findByText('Присідання · 8.5 із 10'))

    const details = screen.getByRole('group')
    expect(within(details).getByText('3 із 10')).toBeInTheDocument()
    expect(within(details).getByText('Праве коліно')).toBeInTheDocument()
    expect(within(details).getByText(/Праве коліно: надто зігнуто/)).toBeInTheDocument()

    await user.click(within(details).getByRole('button', { name: 'Переглянути відео виконання' }))

    expect(
      await within(details).findByRole('button', { name: 'Сховати відео' }),
    ).toBeInTheDocument()
    expect(getSessionVideoUrl).toHaveBeenCalledWith('session-1')
  })

  it('offers no video button for a session without a video', async () => {
    const user = userEvent.setup()
    vi.mocked(listPatientSessions).mockResolvedValue([
      makeSession({ has_video: false, score: null, joint_deviations: {} }),
    ])
    renderCard()

    await user.click(await screen.findByText('Присідання'))

    expect(screen.getByText('Аналіз ще не доступний')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Переглянути відео виконання' }),
    ).not.toBeInTheDocument()
  })

  it('shows an empty message when the patient has no sessions', async () => {
    vi.mocked(listPatientSessions).mockResolvedValue([])
    renderCard()

    expect(await screen.findByText('Пацієнт ще не завершив жодної сесії.')).toBeInTheDocument()
  })

  it('shows the error when the sessions cannot be loaded', async () => {
    vi.mocked(listPatientSessions).mockRejectedValue(new Error('Сервер недоступний'))
    renderCard()

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервер недоступний')
  })

  it('shows ten sessions first and the rest on request', async () => {
    const user = userEvent.setup()
    vi.mocked(listPatientSessions).mockResolvedValue(
      Array.from({ length: 12 }, (_, index) =>
        makeSession({
          id: `session-${index}`,
          completed_at: `2026-03-${String(index + 1).padStart(2, '0')}T10:00:00Z`,
        }),
      ),
    )
    renderCard()

    expect(await screen.findAllByText('Присідання · 8.5 із 10')).toHaveLength(10)

    await user.click(screen.getByRole('button', { name: 'Показати ще (2)' }))

    expect(screen.getAllByText('Присідання · 8.5 із 10')).toHaveLength(12)
    expect(screen.queryByRole('button', { name: /Показати ще/ })).not.toBeInTheDocument()
  })
})
