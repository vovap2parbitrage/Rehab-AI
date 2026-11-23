import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HelpRequest } from '../api/helpRequests'
import { getSessionVideoUrl } from '../api/sessions'
import { HelpRequestList } from '../components/HelpRequestList'

vi.mock('../api/sessions', () => ({
  getSessionVideoUrl: vi.fn(),
  listPatientSessions: vi.fn(),
}))

const question: HelpRequest = {
  id: 'question-1',
  session_id: 'session-7',
  assignment_id: 'assignment-1',
  patient_id: 'patient-1',
  patient_name: 'Олена Коваль',
  exercise_name: 'Присідання',
  pain_score: 4,
  score: 8.5,
  has_video: true,
  joint_deviations: {
    repetitions: 7,
    joint_scores: { r_knee: 8.1 },
    errors: [
      { joint: 'r_knee', start_s: 1, end_s: 1.5, peak_deviation_deg: 18.4, direction: 'too_bent' },
    ],
  },
  message: 'Чи правильно я виконую вправу?',
  reply: null,
  replied_by_email: null,
  created_at: '2026-03-01T10:00:00Z',
  replied_at: null,
}

afterEach(() => {
  vi.clearAllMocks()
})

function renderList(item: HelpRequest, showSession: boolean) {
  return render(
    <MemoryRouter>
      <HelpRequestList items={[item]} showExercise showSession={showSession} />
    </MemoryRouter>,
  )
}

describe('The session behind a patient question (therapist view)', () => {
  it('shows the score, the errors and a video the doctor can play', async () => {
    const user = userEvent.setup()
    vi.mocked(getSessionVideoUrl).mockResolvedValue('https://storage.test/session.mp4')
    renderList(question, true)

    await user.click(screen.getByText('Сесія · оцінка 8.5 із 10 · є відео'))

    expect(screen.getByText(/Праве коліно: надто зігнуто/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Переглянути відео виконання' }))
    expect(await screen.findByRole('button', { name: 'Сховати відео' })).toBeInTheDocument()
    expect(getSessionVideoUrl).toHaveBeenCalledWith('session-7')
  })

  it('says only what exists when the session has no video', () => {
    renderList({ ...question, has_video: false }, true)

    expect(screen.getByText('Сесія · оцінка 8.5 із 10')).toBeInTheDocument()
  })

  it('shows nothing extra for a question about a session that was never analysed', () => {
    renderList({ ...question, score: null, has_video: false, joint_deviations: {} }, true)

    expect(screen.queryByText(/Сесія ·/)).not.toBeInTheDocument()
  })

  it('does not show the session where the list is not for the doctor', () => {
    renderList(question, false)

    expect(screen.queryByText(/Сесія ·/)).not.toBeInTheDocument()
  })
})
