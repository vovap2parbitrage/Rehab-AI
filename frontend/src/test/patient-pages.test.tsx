import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from '../auth/AuthContext'
import { AuthContext } from '../auth/AuthContext'
import { RoleRoute } from '../auth/RoleRoute'
import type { PatientAssignment, PatientInvitation, PatientSession } from '../api/patient'
import type { HelpRequest } from '../api/helpRequests'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'
import {
  PatientDashboardPage,
  PatientExerciseExecutionPage,
  PatientExercisesPage,
  PatientInvitationsPage,
  PatientTherapistsPage,
} from '../pages/PatientWorkspacePages'
import { PatientWorkspaceProvider } from '../lib/patientWorkspace'
import {
  completePatientAssignment,
  listPatientAssignments,
  listPatientInvitations,
  listPatientTherapists,
  respondToPatientInvitation,
} from '../api/patient'
import { createHelpRequest, listMyHelpRequests } from '../api/helpRequests'
import { fetchCurrentUser } from '../api/auth'

vi.mock('../api/patient', () => ({
  completePatientAssignment: vi.fn(),
  listPatientAssignments: vi.fn(),
  listPatientInvitations: vi.fn(),
  listPatientTherapists: vi.fn(),
  respondToPatientInvitation: vi.fn(),
}))

vi.mock('../api/helpRequests', () => ({
  createHelpRequest: vi.fn(),
  listMyHelpRequests: vi.fn(),
}))

vi.mock('../api/auth', () => ({
  fetchCurrentUser: vi.fn(),
}))

function createAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    initialized: true,
    authenticated: false,
    tokenParsed: { preferred_username: 'olena' },
    initError: null,
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function LocationDisplay() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

function renderWithAuth(
  ui: React.ReactNode,
  auth = createAuth(),
  initialEntries: Parameters<typeof MemoryRouter>[0]['initialEntries'] = ['/'],
) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  )
}

function renderPatientPage(
  path: string,
  page: React.ReactNode,
  auth = createAuth({ authenticated: true }),
) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <PatientWorkspaceProvider>
          <Routes>
            <Route path="/patient" element={<PatientDashboardPage />} />
            <Route path="/patient/therapists" element={<PatientTherapistsPage />} />
            <Route path="/patient/invitations" element={<PatientInvitationsPage />} />
            <Route path="/patient/exercises" element={<PatientExercisesPage />} />
            <Route
              path="/patient/exercises/:assignmentId/execute"
              element={<PatientExerciseExecutionPage />}
            />
            <Route path="*" element={page} />
          </Routes>
        </PatientWorkspaceProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

const pendingInvitation: PatientInvitation = {
  id: 'invitation-1',
  patient_id: 'patient-1',
  therapist_id: 'therapist-1',
  therapist_email: 'doctor@example.com',
  status: 'pending',
  message: 'Запрошую на консультацію',
  created_at: '2026-01-02T10:00:00Z',
  responded_at: null,
}

const acceptedInvitation: PatientInvitation = {
  ...pendingInvitation,
  id: 'invitation-2',
  therapist_id: 'therapist-2',
  therapist_email: 'second.doctor@example.com',
  status: 'accepted',
  responded_at: '2026-01-03T10:00:00Z',
}

const patientAssignment: PatientAssignment = {
  id: 'assignment-1',
  patient_id: 'patient-1',
  exercise_id: 'exercise-1',
  repetitions: 12,
  sessions_per_week: 3,
  starts_on: '2026-01-01',
  ends_on: null,
  status: 'active',
  exercise: {
    id: 'exercise-1',
    name: 'Розгинання коліна',
    description: 'Виконуйте вправу повільно.',
    reference_video_key: null,
  },
  sessions: [],
}

const session: PatientSession = {
  id: 'session-1',
  assignment_id: 'assignment-1',
  pain_score: 4,
  completed_at: '2026-01-04T10:00:00Z',
  score: null,
  joint_deviations: {},
  created_at: '2026-01-04T10:00:00Z',
}

const helpRequest: HelpRequest = {
  id: 'question-1',
  session_id: 'session-1',
  assignment_id: 'assignment-1',
  patient_id: 'patient-1',
  patient_name: 'Олена',
  exercise_name: 'Розгинання коліна',
  pain_score: 4,
  message: 'Чи правильно я виконую вправу?',
  reply: null,
  replied_by_email: null,
  created_at: '2026-01-04T10:00:00Z',
  replied_at: null,
}

beforeEach(() => {
  vi.mocked(listPatientInvitations).mockResolvedValue([])
  vi.mocked(listPatientAssignments).mockResolvedValue([])
  vi.mocked(listPatientTherapists).mockResolvedValue([])
  vi.mocked(listMyHelpRequests).mockResolvedValue([])
  vi.mocked(respondToPatientInvitation).mockResolvedValue(pendingInvitation)
  vi.mocked(completePatientAssignment).mockResolvedValue(session)
  vi.mocked(createHelpRequest).mockResolvedValue(helpRequest)
  vi.mocked(fetchCurrentUser).mockResolvedValue({
    id: 'patient-1',
    email: 'olena@example.com',
    role: 'patient',
    pending_role: null,
    keycloak_sub: null,
    is_active: true,
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Login page', () => {
  it('starts the protected login flow and links to registration', async () => {
    const user = userEvent.setup()
    const auth = createAuth()
    renderWithAuth(<LoginPage />, auth)

    await user.click(screen.getByRole('button', { name: 'Увійти' }))

    expect(auth.login).toHaveBeenCalledWith('/profile')
    expect(screen.getByRole('link', { name: 'Зареєструватися' })).toHaveAttribute(
      'href',
      '/register',
    )
  })

  it('shows a busy state while login is in progress', async () => {
    const user = userEvent.setup()
    let finishLogin!: () => void
    const auth = createAuth({
      login: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishLogin = resolve
          }),
      ),
    })
    renderWithAuth(<LoginPage />, auth)

    await user.click(screen.getByRole('button', { name: 'Увійти' }))
    expect(screen.getByRole('button', { name: 'Переходимо до захищеного входу…' })).toBeDisabled()

    await act(async () => finishLogin())
  })

  it('shows a recoverable error when Keycloak rejects login', async () => {
    const user = userEvent.setup()
    const auth = createAuth({ login: vi.fn().mockRejectedValue(new Error('offline')) })
    renderWithAuth(<LoginPage />, auth)

    await user.click(screen.getByRole('button', { name: 'Увійти' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не вдалося відкрити сторінку входу.',
    )
    expect(screen.getByRole('button', { name: 'Увійти' })).toBeEnabled()
  })

  it('explains an OAuth access-denied error', () => {
    renderWithAuth(<LoginPage />, createAuth(), ['/login?error=access_denied'])

    expect(screen.getByRole('alert')).toHaveTextContent('Вхід скасовано')
    expect(screen.getByRole('alert')).toHaveTextContent('Доступ до облікового запису не надано')
    expect(screen.getByText('Код помилки:')).toBeInTheDocument()
  })

  it('disables login and offers retry when authorization initialization failed', () => {
    renderWithAuth(
      <LoginPage />,
      createAuth({ initError: 'Keycloak тимчасово недоступний' }),
    )

    expect(screen.getByRole('button', { name: 'Увійти' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Keycloak тимчасово недоступний')
    expect(screen.getByRole('button', { name: 'Перевірити знову' })).toBeEnabled()
  })

  it('returns an authenticated user to the saved in-app path', () => {
    renderWithAuth(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/patient/invitations" element={<LocationDisplay />} />
      </Routes>,
      createAuth({ authenticated: true }),
      [{ pathname: '/login', state: { from: '/patient/invitations' } }],
    )

    expect(screen.getByTestId('location')).toHaveTextContent('/patient/invitations')
  })

  it('ignores an unsafe external return path', () => {
    renderWithAuth(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/profile" element={<LocationDisplay />} />
      </Routes>,
      createAuth({ authenticated: true }),
      [{ pathname: '/login', state: { from: '//example.com' } }],
    )

    expect(screen.getByTestId('location')).toHaveTextContent('/profile')
  })
})

describe('Register page', () => {
  it('defaults to patient registration', () => {
    renderWithAuth(<RegisterPage />)

    expect(screen.getByRole('radio', { name: /Пацієнт/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Зареєструватися як пацієнт' })).toBeInTheDocument()
  })

  it('stores the selected therapist role before starting registration', async () => {
    const user = userEvent.setup()
    const auth = createAuth()
    renderWithAuth(<RegisterPage />, auth, [
      { pathname: '/register', state: { from: '/patient' } },
    ])

    await user.click(screen.getByRole('radio', { name: /Лікар/ }))
    expect(screen.getByText(/Роль лікаря потребує підтвердження/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Зареєструватися як лікар' }))

    expect(window.sessionStorage.getItem('airehab.registration-role')).toBe('therapist')
    expect(auth.register).toHaveBeenCalledWith('/patient')
  })

  it('removes the saved role and shows an error when registration cannot start', async () => {
    const user = userEvent.setup()
    const auth = createAuth({ register: vi.fn().mockRejectedValue(new Error('offline')) })
    renderWithAuth(<RegisterPage />, auth)

    await user.click(screen.getByRole('button', { name: 'Зареєструватися як пацієнт' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не вдалося відкрити сторінку входу.',
    )
    expect(window.sessionStorage.getItem('airehab.registration-role')).toBeNull()
    expect(screen.getByRole('button', { name: 'Зареєструватися як пацієнт' })).toBeEnabled()
  })

  it('shows OAuth errors returned from registration', () => {
    renderWithAuth(<RegisterPage />, createAuth(), ['/register?error=temporarily_unavailable'])

    expect(screen.getByRole('alert')).toHaveTextContent('Сервіс авторизації недоступний')
  })

  it('disables registration after an initialization failure', () => {
    renderWithAuth(<RegisterPage />, createAuth({ initError: 'Немає з’єднання' }))

    expect(screen.getByRole('button', { name: 'Зареєструватися як пацієнт' })).toBeDisabled()
  })
})

describe('Patient access and cabinet pages', () => {
  it('redirects an anonymous visitor to login with the requested cabinet path', async () => {
    renderWithAuth(
      <Routes>
        <Route path="/patient" element={
          <RoleRoute allowedRoles={['patient']}>
            <PatientDashboardPage />
          </RoleRoute>
        } />
        <Route path="/login" element={<LocationDisplay />} />
      </Routes>,
      createAuth({ authenticated: false }),
      ['/patient'],
    )

    expect(screen.getByTestId('location')).toHaveTextContent('/login')
  })

  it('redirects a therapist away from the patient cabinet', async () => {
    vi.mocked(fetchCurrentUser).mockResolvedValueOnce({
      id: 'therapist-1',
      email: 'doctor@example.com',
      role: 'therapist',
      pending_role: null,
      keycloak_sub: null,
      is_active: true,
    })
    renderWithAuth(
      <Routes>
        <Route path="/patient" element={
          <RoleRoute allowedRoles={['patient']}>
            <PatientDashboardPage />
          </RoleRoute>
        } />
        <Route path="/profile" element={<LocationDisplay />} />
      </Routes>,
      createAuth({ authenticated: true }),
      ['/patient'],
    )

    expect(await screen.findByTestId('location')).toHaveTextContent('/profile')
  })

  it('reports an API error if the user role cannot be checked', async () => {
    vi.mocked(fetchCurrentUser).mockRejectedValueOnce(new Error('API unavailable'))
    renderWithAuth(
      <Routes>
        <Route path="/patient" element={
          <RoleRoute allowedRoles={['patient']}>
            <PatientDashboardPage />
          </RoleRoute>
        } />
      </Routes>,
      createAuth({ authenticated: true }),
      ['/patient'],
    )

    expect(await screen.findByRole('heading', { name: 'Не вдалося перевірити доступ' }))
      .toBeInTheDocument()
    expect(screen.getByText('Не вдалося перевірити роль користувача.')).toBeInTheDocument()
  })

  it('shows patient name, pending invitation, and exercise totals on the dashboard', async () => {
    vi.mocked(listPatientInvitations).mockResolvedValue([pendingInvitation, acceptedInvitation])
    vi.mocked(listPatientAssignments).mockResolvedValue([
      { ...patientAssignment, sessions: [session] },
      { ...patientAssignment, id: 'assignment-2', status: 'inactive', sessions: [session] },
    ])
    renderPatientPage('/patient', <PatientDashboardPage />, createAuth({
      authenticated: true,
      tokenParsed: { given_name: 'Олена', family_name: 'Коваль' },
    }))

    expect(await screen.findByRole('heading', { name: 'Вітаємо, Олена Коваль' }))
      .toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Вам надійшло запрошення' })).toBeInTheDocument()
    expect(screen.getByText('2 виконаних сесій')).toBeInTheDocument()
    expect(screen.getByText('1 активних призначень')).toBeInTheDocument()
  })

  it('shows an empty dashboard message when no invitations or assignments exist', async () => {
    renderPatientPage('/patient', <PatientDashboardPage />)

    expect(await screen.findByRole('heading', { name: 'Очікуйте запрошення від лікаря' }))
      .toBeInTheDocument()
  })

  it('lists connected therapists with the email from their accepted invitation', async () => {
    vi.mocked(listPatientInvitations).mockResolvedValue([acceptedInvitation])
    vi.mocked(listPatientAssignments).mockResolvedValue([patientAssignment])
    vi.mocked(listPatientTherapists).mockResolvedValue([
      { id: 'therapist-2', role: 'therapist' },
    ])
    renderPatientPage('/patient/therapists', <PatientTherapistsPage />)

    expect(await screen.findByRole('heading', { name: 'second.doctor@example.com' }))
      .toBeInTheDocument()
    expect(screen.getByText('Ви прийняли запрошення цього лікаря.')).toBeInTheDocument()
  })

  it('accepts a pending therapist invitation', async () => {
    const user = userEvent.setup()
    vi.mocked(listPatientInvitations).mockResolvedValue([pendingInvitation])
    renderPatientPage('/patient/invitations', <PatientInvitationsPage />)
    await screen.findByText('doctor@example.com')

    await user.click(screen.getByRole('button', { name: 'Прийняти запрошення' }))

    await waitFor(() =>
      expect(respondToPatientInvitation).toHaveBeenCalledWith('invitation-1', 'accepted'),
    )
  })

  it('shows an invitation error and lets the patient retry', async () => {
    const user = userEvent.setup()
    vi.mocked(listPatientInvitations).mockResolvedValue([pendingInvitation])
    vi.mocked(respondToPatientInvitation).mockRejectedValueOnce(new Error('Сервер недоступний'))
    renderPatientPage('/patient/invitations', <PatientInvitationsPage />)
    await screen.findByText('doctor@example.com')

    await user.click(screen.getByRole('button', { name: 'Відхилити' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервер недоступний')
    const error = screen.getByRole('alert')
    await user.click(within(error).getByRole('button', { name: 'Спробувати ще раз' }))
    await waitFor(() => expect(listPatientInvitations).toHaveBeenCalledTimes(2))
  })

  it('renders active exercises and omits the execution action for inactive ones', async () => {
    vi.mocked(listPatientAssignments).mockResolvedValue([
      patientAssignment,
      { ...patientAssignment, id: 'assignment-2', exercise: { ...patientAssignment.exercise, name: 'Пасивне розгинання' }, status: 'inactive' },
    ])
    renderPatientPage('/patient/exercises', <PatientExercisesPage />)

    expect(await screen.findByRole('heading', { name: 'Розгинання коліна' })).toBeInTheDocument()
    expect(screen.getByText('Пасивне розгинання')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Виконати вправу/ })).toHaveLength(1)
  })

  it('shows an empty state when no exercises have been assigned', async () => {
    renderPatientPage('/patient/exercises', <PatientExercisesPage />)

    expect(await screen.findByRole('heading', { name: 'Призначень поки немає' }))
      .toBeInTheDocument()
  })

  it('saves a completed session with a pain score and confirms success', async () => {
    const user = userEvent.setup()
    vi.mocked(listPatientAssignments).mockResolvedValue([patientAssignment])
    renderPatientPage(
      '/patient/exercises/assignment-1/execute',
      <PatientExerciseExecutionPage />,
    )

    await user.selectOptions(
      await screen.findByLabelText('Рівень болю після вправи (необов’язково)'),
      '7',
    )
    await user.click(screen.getByRole('button', { name: 'Завершити сесію' }))

    expect(await screen.findByRole('heading', { name: 'Виконання записано' }))
      .toBeInTheDocument()
    expect(completePatientAssignment).toHaveBeenCalledWith('assignment-1', { pain_score: 7 })
  })

  it('saves a completed session without an optional pain score', async () => {
    const user = userEvent.setup()
    vi.mocked(listPatientAssignments).mockResolvedValue([patientAssignment])
    renderPatientPage(
      '/patient/exercises/assignment-1/execute',
      <PatientExerciseExecutionPage />,
    )

    await user.click(await screen.findByRole('button', { name: 'Завершити сесію' }))

    expect(await screen.findByRole('heading', { name: 'Виконання записано' }))
      .toBeInTheDocument()
    expect(completePatientAssignment).toHaveBeenCalledWith('assignment-1', {})
  })

  it('shows a completion error and leaves the form available for retry', async () => {
    const user = userEvent.setup()
    vi.mocked(listPatientAssignments).mockResolvedValue([patientAssignment])
    vi.mocked(completePatientAssignment).mockRejectedValueOnce(new Error('Збереження не вдалося'))
    renderPatientPage(
      '/patient/exercises/assignment-1/execute',
      <PatientExerciseExecutionPage />,
    )

    await user.click(await screen.findByRole('button', { name: 'Завершити сесію' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Збереження не вдалося')
    expect(screen.getByRole('button', { name: 'Завершити сесію' })).toBeEnabled()
  })

  it('submits a trimmed question to the doctor after saving the session', async () => {
    const user = userEvent.setup()
    vi.mocked(listPatientAssignments).mockResolvedValue([patientAssignment])
    renderPatientPage(
      '/patient/exercises/assignment-1/execute',
      <PatientExerciseExecutionPage />,
    )
    await user.click(await screen.findByRole('button', { name: 'Завершити сесію' }))

    await user.type(await screen.findByLabelText('Ваше запитання'), '  Потрібна порада  ')
    await user.click(screen.getByRole('button', { name: 'Надіслати запитання' }))

    expect(await screen.findByText(/Запитання надіслано лікарю/)).toBeInTheDocument()
    expect(createHelpRequest).toHaveBeenCalledWith('session-1', 'Потрібна порада')
  })

  it('reports a failed question submission without clearing the typed message', async () => {
    const user = userEvent.setup()
    vi.mocked(listPatientAssignments).mockResolvedValue([patientAssignment])
    vi.mocked(createHelpRequest).mockRejectedValueOnce(new Error('Не вдалося надіслати запитання'))
    renderPatientPage(
      '/patient/exercises/assignment-1/execute',
      <PatientExerciseExecutionPage />,
    )
    await user.click(await screen.findByRole('button', { name: 'Завершити сесію' }))
    const question = await screen.findByLabelText('Ваше запитання')
    await user.type(question, 'Допоможіть, будь ласка')
    await user.click(screen.getByRole('button', { name: 'Надіслати запитання' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не вдалося надіслати запитання')
    expect(question).toHaveValue('Допоможіть, будь ласка')
  })

  it('shows a workspace error when loading cabinet data fails and retries the request', async () => {
    const user = userEvent.setup()
    vi.mocked(listPatientInvitations).mockRejectedValueOnce(new Error('Не вдалося завантажити'))
    renderPatientPage('/patient', <PatientDashboardPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Не вдалося завантажити')
    await user.click(screen.getByRole('button', { name: 'Спробувати ще раз' }))

    await waitFor(() => expect(listPatientInvitations).toHaveBeenCalledTimes(2))
  })
})
