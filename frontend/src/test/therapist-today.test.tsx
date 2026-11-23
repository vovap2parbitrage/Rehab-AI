import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Today } from '../api/therapist'
import type { CachedResource } from '../lib/useCachedResource'
import { TherapistTodayPage } from '../pages/therapist/TherapistTodayPage'
import type { TherapistWorkspaceResources } from '../pages/therapist/TherapistWorkspaceLayout'

vi.mock('../api/messages', () => ({
  sendMessage: vi.fn(),
}))

const today: Today = {
  date: '2026-11-26',
  timezone: 'Europe/Kyiv',
  counters: {
    active_patients: 5,
    due_today: 3,
    finished: 1,
    not_finished: 2,
    missed_yesterday: 1,
    open_questions: 4,
    new_replies: 2,
  },
  not_finished: [
    {
      patient_id: 'p1',
      patient_name: 'Олена Коваль',
      last_completed_at: null,
      items: [
        { assignment_id: 'a1', exercise_name: 'Присідання', done: true },
        { assignment_id: 'a2', exercise_name: 'Випади', done: false },
        { assignment_id: 'a3', exercise_name: 'Міст', done: false },
      ],
    },
    {
      patient_id: 'p2',
      patient_name: 'Іван Петренко',
      last_completed_at: null,
      items: [{ assignment_id: 'a4', exercise_name: 'Присідання', done: false }],
    },
  ],
  finished: [
    {
      patient_id: 'p3',
      patient_name: 'Марія Шевченко',
      last_completed_at: '2026-11-26T09:30:00Z',
      items: [{ assignment_id: 'a5', exercise_name: 'Міст', done: true }],
    },
  ],
  missed_yesterday: [
    {
      patient_id: 'p2',
      patient_name: 'Іван Петренко',
      last_completed_at: null,
      items: [{ assignment_id: 'a4', exercise_name: 'Присідання', done: false }],
    },
  ],
}

function renderPage(data: Today | undefined, error: string | null = null) {
  const resource = {
    data,
    loading: false,
    error,
    idle: false,
    load: vi.fn(),
    update: vi.fn(),
    invalidate: vi.fn(),
  } as CachedResource<Today>

  render(
    <MemoryRouter initialEntries={['/therapist/today']}>
      <Routes>
        <Route
          element={
            <Outlet context={{ today: resource } as unknown as TherapistWorkspaceResources} />
          }
        >
          <Route path="/therapist/today" element={<TherapistTodayPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
  return resource
}

describe('The therapist Today page', () => {
  it('shows the day and the counters', () => {
    renderPage(today)

    expect(screen.getByText(/четвер, 26 листопада/)).toBeInTheDocument()
    const counters = screen.getByLabelText('Підсумок дня')
    expect(
      within(counters).getByText('пацієнтів із заняттям сьогодні').previousSibling,
    ).toHaveTextContent('3')
    expect(within(counters).getByText('виконали все').previousSibling).toHaveTextContent('1')
    expect(within(counters).getByText('ще не виконали').previousSibling).toHaveTextContent('2')
    expect(within(counters).getByText('пропустили вчора').previousSibling).toHaveTextContent('1')
    expect(
      within(counters).getByText('запитань чекають відповіді').previousSibling,
    ).toHaveTextContent('4')
  })

  it('says what is left for a patient who did only part of it', () => {
    renderPage(today)

    expect(screen.getByRole('heading', { name: 'Ще не виконали (2)' })).toBeInTheDocument()
    expect(screen.getByText(/Виконано 1 з 3\. Лишилось: Випади, Міст/)).toBeInTheDocument()
    expect(screen.getByText(/Виконано 0 з 1\. Лишилось: Присідання/)).toBeInTheDocument()
  })

  it('lists who did everything and who missed yesterday, each linking to the patient', () => {
    renderPage(today)

    expect(screen.getByRole('heading', { name: 'Виконали все (1)' })).toBeInTheDocument()
    expect(screen.getByText(/Міст · останнє о/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Пропустили вчора (1)' })).toBeInTheDocument()
    expect(screen.getByText('Не виконано: Присідання')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Іван Петренко' })[0]).toHaveAttribute(
      'href',
      '/therapist/patients/p2',
    )
  })

  it('lets the doctor write to a patient who has not finished, with the missing exercises in the text', async () => {
    const user = userEvent.setup()
    renderPage(today)

    // Two patients have something left today and one missed yesterday.
    const buttons = screen.getAllByRole('button', { name: 'Написати' })
    expect(buttons).toHaveLength(3)

    await user.click(buttons[0])

    expect(screen.getByLabelText('Повідомлення пацієнту')).toHaveValue(
      'Добрий день! Сьогодні у вас лишились вправи: Випади, Міст. Чи все гаразд?',
    )
  })

  it('shows how many replies to the doctor’s messages are new', () => {
    renderPage(today)

    expect(
      screen.getByText('нових відповідей на ваші повідомлення').previousSibling,
    ).toHaveTextContent('2')
  })

  it('links the open questions counter to the questions page', () => {
    renderPage(today)

    expect(screen.getByRole('link', { name: /запитань чекають відповіді/ })).toHaveAttribute(
      'href',
      '/therapist/questions',
    )
  })

  it('says so when nothing is due and nothing was missed', () => {
    renderPage({
      ...today,
      counters: {
        ...today.counters,
        due_today: 0,
        finished: 0,
        not_finished: 0,
        missed_yesterday: 0,
      },
      not_finished: [],
      finished: [],
      missed_yesterday: [],
    })

    expect(screen.getByText(/На сьогодні занять немає/)).toBeInTheDocument()
  })

  it('shows the error and offers to try again', () => {
    renderPage(undefined, 'Не вдалося завантажити сторінку «Сьогодні».')

    expect(screen.getByRole('alert')).toHaveTextContent('Не вдалося завантажити')
  })
})
