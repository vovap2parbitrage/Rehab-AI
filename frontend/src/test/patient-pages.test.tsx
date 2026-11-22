import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from '../auth/AuthContext'
import { AuthContext } from '../auth/AuthContext'
import { AuthProvider } from '../auth/AuthProvider'
import { RoleRoute } from '../auth/RoleRoute'
import { Header } from '../components/Header'
import { NeedsAttentionSection } from '../components/NeedsAttentionSection'
import type { PatientAssignment, PatientInvitation, PatientSession } from '../api/patient'
import type { HelpRequest } from '../api/helpRequests'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'
import { PatientDashboardPage } from '../pages/patient/PatientDashboardPage'
import { PatientExerciseExecutionPage } from '../pages/patient/PatientExerciseExecutionPage'
import { PatientExercisesPage } from '../pages/patient/PatientExercisesPage'
import { PatientInvitationsPage } from '../pages/patient/PatientInvitationsPage'
import { PatientTherapistsPage } from '../pages/patient/PatientTherapistsPage'
import { PatientWorkspaceProvider } from '../lib/patientWorkspace'
import { TherapistQuestionsProvider } from '../lib/TherapistQuestionsProvider'
import {
  completePatientAssignment,
  listPatientAssignments,
  listPatientInvitations,
  listPatientTherapists,
  respondToPatientInvitation,
} from '../api/patient'
import {
  createHelpRequest,
  listMyHelpRequests,
  listNeedsAttention,
  listPatientHelpRequests,
  replyToHelpRequest,
} from '../api/helpRequests'
import { getMyHistory, getPatientHistory, type PatientHistory } from '../api/history'
import {
  createAssignment,
  getPatient,
  listAssignments,
  listExercises,
  listPatients,
} from '../api/therapist'
import { ApiError } from '../api/client'
import { getComparison, startComparison, type ComparisonResult } from '../api/comparisons'
import { getSessionVideoUrl } from '../api/sessions'
import { getExerciseVideoUrl, uploadVideo } from '../api/uploads'
import { fetchCurrentUser, requestTherapistRole, type UserProfile } from '../api/auth'
import { ProfilePage } from '../pages/profile/ProfilePage'
import { TherapistExercisesPage } from '../pages/therapist/TherapistExercisesPage'
import { TherapistPatientPage } from '../pages/therapist/TherapistPatientPage'
import { TherapistPatientsPage } from '../pages/therapist/TherapistPatientsPage'
import { TherapistWorkspaceLayout } from '../pages/therapist/TherapistWorkspaceLayout'
import { MOCK_ASSIGNMENT, MOCK_EXERCISE, MOCK_PATIENT } from '../data/therapistMocks'

vi.mock('../api/patient', () => ({
  completePatientAssignment: vi.fn(),
  listPatientAssignments: vi.fn(),
  listPatientInvitations: vi.fn(),
  listPatientTherapists: vi.fn(),
  respondToPatientInvitation: vi.fn(),
}))

vi.mock('../api/history', () => ({
  getMyHistory: vi.fn(),
  getPatientHistory: vi.fn(),
}))

vi.mock('../api/therapist', () => ({
  createAssignment: vi.fn(),
  getPatient: vi.fn(),
  listAssignments: vi.fn(),
  listExercises: vi.fn(),
  listPatients: vi.fn(),
}))

vi.mock('../api/comparisons', () => ({
  startComparison: vi.fn(),
  getComparison: vi.fn(),
}))

vi.mock('../api/sessions', () => ({
  getSessionVideoUrl: vi.fn(),
}))

vi.mock('../api/uploads', () => ({
  uploadVideo: vi.fn(),
  getExerciseVideoUrl: vi.fn(),
}))

vi.mock('../api/helpRequests', () => ({
  createHelpRequest: vi.fn(),
  listMyHelpRequests: vi.fn(),
  listNeedsAttention: vi.fn(),
  listPatientHelpRequests: vi.fn(),
  replyToHelpRequest: vi.fn(),
}))

vi.mock('../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auth')>()),
  fetchCurrentUser: vi.fn(),
  requestTherapistRole: vi.fn(),
}))

vi.mock('../auth/keycloak', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth/keycloak')>()),
  getKeycloak: () => ({ authenticated: true, tokenParsed: { sub: 'patient-1' } }),
  initKeycloak: async () => true,
}))

function createAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    initialized: true,
    authenticated: false,
    tokenParsed: { preferred_username: 'olena' },
    initError: null,
    role: null,
    user: null,
    userLoading: false,
    userError: null,
    refreshUser: vi.fn(),
    updateUser: vi.fn(),
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

const patientAssignment: PatientAssignment = {
  id: 'assignment-1',
  patient_id: 'patient-1',
  exercise_id: 'exercise-1',
  repetitions: 12,
  duration_weeks: 4,
  weekdays: [0, 2, 4],
  starts_on: '2026-01-01',
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
  has_video: false,
  created_at: '2026-01-04T10:00:00Z',
}

const doneResult: ComparisonResult = {
  task_id: 'task-1',
  status: 'done',
  score: 8.5,
  worst_repetition_score: 7,
  repetitions: 7,
  repetition_scores: [8, 9],
  joint_scores: { r_knee: 8.1 },
  errors: [
    { joint: 'r_knee', start_s: 1, end_s: 1.5, peak_deviation_deg: 18.4, direction: 'too_bent' },
  ],
  message: null,
  session_id: 'session-9',
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

const currentPatient: UserProfile = {
  id: 'patient-1',
  email: 'olena@example.com',
  role: 'patient',
  pending_role: null,
  keycloak_sub: null,
  is_active: true,
}

beforeEach(() => {
  vi.mocked(getMyHistory).mockResolvedValue(emptyHistory)
  vi.mocked(listPatientInvitations).mockResolvedValue([])
  vi.mocked(listPatientAssignments).mockResolvedValue([])
  vi.mocked(listPatientTherapists).mockResolvedValue([])
  vi.mocked(listMyHelpRequests).mockResolvedValue([])
  vi.mocked(listNeedsAttention).mockResolvedValue([])
  vi.mocked(respondToPatientInvitation).mockResolvedValue(pendingInvitation)
  vi.mocked(completePatientAssignment).mockResolvedValue(session)
  vi.mocked(createHelpRequest).mockResolvedValue(helpRequest)
  vi.mocked(uploadVideo).mockResolvedValue('videos/u/' + 'c'.repeat(32) + '.mp4')
  vi.mocked(startComparison).mockResolvedValue({ task_id: 'task-1' })
  vi.mocked(getComparison).mockResolvedValue(doneResult)
  vi.mocked(fetchCurrentUser).mockResolvedValue(currentPatient)
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
    act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false })))
    expect(screen.getByRole('button', { name: 'Переходимо до захищеного входу…' })).toBeDisabled()

    act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    expect(screen.getByRole('button', { name: 'Увійти' })).toBeEnabled()
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
    renderWithAuth(<LoginPage />, createAuth({ initError: 'Keycloak тимчасово недоступний' }))

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
    renderWithAuth(<RegisterPage />, auth, [{ pathname: '/register', state: { from: '/patient' } }])

    await user.click(screen.getByRole('radio', { name: /Лікар/ }))
    expect(screen.getByText(/Роль лікаря потребує підтвердження/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Зареєструватися як лікар' }))

    expect(window.sessionStorage.getItem('airehab.registration-role')).toBe('therapist')
    expect(auth.register).toHaveBeenCalledWith('/patient')

    act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    expect(screen.getByRole('button', { name: 'Зареєструватися як лікар' })).toBeEnabled()
    expect(window.sessionStorage.getItem('airehab.registration-role')).toBeNull()
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

  it('clears the saved role when the user returns from Keycloak without registering', () => {
    window.sessionStorage.setItem('airehab.registration-role', 'therapist')
    renderWithAuth(<RegisterPage />, createAuth(), ['/register?error=access_denied'])

    expect(screen.getByRole('alert')).toHaveTextContent('Реєстрацію скасовано')
    expect(screen.getByRole('alert')).toHaveTextContent('Код помилки: access_denied')
    expect(screen.getByRole('button', { name: 'Зареєструватися як пацієнт' })).toBeEnabled()
    expect(window.sessionStorage.getItem('airehab.registration-role')).toBeNull()
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
        <Route
          path="/patient"
          element={
            <RoleRoute allowedRoles={['patient']}>
              <PatientDashboardPage />
            </RoleRoute>
          }
        />
        <Route path="/login" element={<LocationDisplay />} />
      </Routes>,
      createAuth({ authenticated: false }),
      ['/patient'],
    )

    expect(screen.getByTestId('location')).toHaveTextContent('/login')
  })

  it('redirects a therapist away from the patient cabinet', async () => {
    renderWithAuth(
      <Routes>
        <Route
          path="/patient"
          element={
            <RoleRoute allowedRoles={['patient']}>
              <PatientDashboardPage />
            </RoleRoute>
          }
        />
        <Route path="/profile" element={<LocationDisplay />} />
      </Routes>,
      createAuth({ authenticated: true, role: 'therapist' }),
      ['/patient'],
    )

    expect(await screen.findByTestId('location')).toHaveTextContent('/profile')
  })

  it('shows a role error and restores the menu and protected route on retry', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchCurrentUser)
      .mockRejectedValueOnce(new ApiError('Сервер недоступний.', 'unavailable', 503))
      .mockRejectedValueOnce(new Error('API unavailable'))

    render(
      <AuthProvider>
        <MemoryRouter>
          <TherapistQuestionsProvider>
            <Header />
            <RoleRoute allowedRoles={['patient']}>
              <p>Кабінет пацієнта</p>
            </RoleRoute>
          </TherapistQuestionsProvider>
        </MemoryRouter>
      </AuthProvider>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Не вдалося перевірити доступ' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Не вдалося завантажити дані облікового запису.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Не вдалося завантажити меню.')
    expect(fetchCurrentUser).toHaveBeenCalledTimes(2)

    await user.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Спробувати ще раз' }),
    )

    expect(await screen.findByRole('link', { name: 'Мій цикл вправ' })).toBeInTheDocument()
    expect(screen.getByText('Кабінет пацієнта')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(fetchCurrentUser).toHaveBeenCalledTimes(3)
  })

  it('shows patient name, pending invitation, and exercise totals on the dashboard', async () => {
    vi.mocked(listPatientInvitations).mockResolvedValue([pendingInvitation, acceptedInvitation])
    vi.mocked(listPatientAssignments).mockResolvedValue([
      { ...patientAssignment, sessions: [session] },
      { ...patientAssignment, id: 'assignment-2', status: 'completed', sessions: [session] },
    ])
    renderPatientPage(
      '/patient',
      <PatientDashboardPage />,
      createAuth({
        authenticated: true,
        tokenParsed: { given_name: 'Олена', family_name: 'Коваль' },
      }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Вітаємо, Олена Коваль' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Вам надійшло запрошення' })).toBeInTheDocument()
    expect(screen.getByText('2 виконаних сесій')).toBeInTheDocument()
    expect(screen.getByText('1 активних призначень')).toBeInTheDocument()
  })

  it('shows an empty dashboard message when no invitations or assignments exist', async () => {
    renderPatientPage('/patient', <PatientDashboardPage />)

    expect(
      await screen.findByRole('heading', { name: 'Очікуйте запрошення від лікаря' }),
    ).toBeInTheDocument()
  })

  it('lists connected therapists with the email from their accepted invitation', async () => {
    vi.mocked(listPatientInvitations).mockResolvedValue([acceptedInvitation])
    vi.mocked(listPatientTherapists).mockResolvedValue([{ id: 'therapist-2', role: 'therapist' }])
    renderPatientPage('/patient/therapists', <PatientTherapistsPage />)

    expect(
      await screen.findByRole('heading', { name: 'second.doctor@example.com' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Ви прийняли запрошення цього лікаря.')).toBeInTheDocument()
    expect(listPatientAssignments).not.toHaveBeenCalled()
  })

  it('uses the assignment patient ID to load doctors when invitations are unavailable', async () => {
    vi.mocked(listPatientInvitations).mockRejectedValueOnce(
      new Error('Не вдалося завантажити запрошення'),
    )
    vi.mocked(listPatientAssignments).mockResolvedValue([patientAssignment])
    vi.mocked(listPatientTherapists).mockResolvedValue([{ id: 'therapist-2', role: 'therapist' }])
    renderPatientPage('/patient/therapists', <PatientTherapistsPage />)

    expect(await screen.findByRole('heading', { name: 'therapist-2' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Не вдалося завантажити запрошення')
    expect(listPatientTherapists).toHaveBeenCalledWith(
      patientAssignment.patient_id,
      expect.anything(),
    )
  })

  it('shows cached invitations and refreshes them while navigating to and from doctors', async () => {
    const user = userEvent.setup()
    const updatedInvitation = {
      ...acceptedInvitation,
      therapist_email: 'updated.doctor@example.com',
    }
    let finishInvitations!: (invitations: PatientInvitation[]) => void
    vi.mocked(listPatientInvitations)
      .mockResolvedValueOnce([acceptedInvitation])
      .mockResolvedValueOnce([acceptedInvitation])
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishInvitations = resolve
          }),
      )
      .mockResolvedValue([updatedInvitation])
    const doctors = [{ id: 'therapist-2', role: 'therapist' }]
    let finishDoctors!: (doctors: Awaited<ReturnType<typeof listPatientTherapists>>) => void
    vi.mocked(listPatientTherapists)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishDoctors = resolve
          }),
      )
      .mockResolvedValue(doctors)
    renderWithAuth(
      <StrictMode>
        <PatientWorkspaceProvider>
          <Link to="/patient/invitations">До запрошень</Link>
          <Link to="/patient/therapists">До лікарів</Link>
          <Routes>
            <Route path="/patient/invitations" element={<PatientInvitationsPage />} />
            <Route path="/patient/therapists" element={<PatientTherapistsPage />} />
          </Routes>
        </PatientWorkspaceProvider>
      </StrictMode>,
      createAuth({ authenticated: true }),
      ['/patient/invitations'],
    )

    expect(await screen.findByText('second.doctor@example.com')).toBeInTheDocument()
    expect(listPatientTherapists).not.toHaveBeenCalled()
    expect(listPatientAssignments).not.toHaveBeenCalled()
    expect(listMyHelpRequests).not.toHaveBeenCalled()

    await user.click(screen.getByRole('link', { name: 'До лікарів' }))
    await waitFor(() => expect(listPatientTherapists).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('link', { name: 'До запрошень' }))
    expect(screen.getByText('second.doctor@example.com')).toBeInTheDocument()
    expect(listPatientInvitations).toHaveBeenCalledTimes(3)
    expect(listPatientTherapists).toHaveBeenCalledTimes(1)

    await act(async () => finishInvitations([updatedInvitation]))
    expect(screen.getByText('updated.doctor@example.com')).toBeInTheDocument()

    await act(async () => finishDoctors(doctors))
    await user.click(screen.getByRole('link', { name: 'До лікарів' }))
    expect(screen.getByRole('heading', { name: 'updated.doctor@example.com' })).toBeInTheDocument()
    expect(listPatientTherapists).toHaveBeenCalledTimes(2)
    expect(listPatientAssignments).not.toHaveBeenCalled()
    expect(listMyHelpRequests).not.toHaveBeenCalled()
  })

  it('shows exercise assignments while the questions request is pending', async () => {
    const user = userEvent.setup()
    vi.mocked(listPatientAssignments).mockResolvedValue([patientAssignment])
    let finishQuestions!: (questions: HelpRequest[]) => void
    vi.mocked(listMyHelpRequests).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishQuestions = resolve
        }),
    )
    renderPatientPage('/patient/exercises', <PatientExercisesPage />)

    await user.click(await screen.findByRole('tab', { name: 'Усі призначення' }))
    expect(screen.getByRole('heading', { name: 'Розгинання коліна' })).toBeInTheDocument()
    expect(listPatientInvitations).not.toHaveBeenCalled()
    expect(listPatientTherapists).not.toHaveBeenCalled()

    await act(async () => finishQuestions([helpRequest]))
    expect(screen.getByText(/Запитання до лікаря \(1\)/)).toBeInTheDocument()
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

  it('lists active and completed assignments and offers execution only for active ones', async () => {
    const user = userEvent.setup()
    vi.mocked(listPatientAssignments).mockResolvedValue([
      patientAssignment,
      {
        ...patientAssignment,
        id: 'assignment-2',
        exercise: { ...patientAssignment.exercise, name: 'Пасивне розгинання' },
        status: 'completed',
      },
    ])
    renderPatientPage('/patient/exercises', <PatientExercisesPage />)

    await user.click(await screen.findByRole('tab', { name: 'Усі призначення' }))

    expect(screen.getByRole('heading', { name: 'Розгинання коліна' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Пасивне розгинання' })).toBeInTheDocument()
    expect(screen.getByText('Завершене')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Виконати вправу/ })).toHaveLength(1)
  })

  it('shows the reference video after the patient asks for it', async () => {
    const user = userEvent.setup()
    vi.mocked(getExerciseVideoUrl).mockResolvedValue('https://storage.test/reference.mp4')
    vi.mocked(listPatientAssignments).mockResolvedValue([
      {
        ...patientAssignment,
        exercise: {
          ...patientAssignment.exercise,
          reference_video_key: 'videos/u/' + 'a'.repeat(32) + '.mp4',
        },
      },
    ])
    renderPatientPage('/patient/exercises', <PatientExercisesPage />)

    await user.click(await screen.findByRole('tab', { name: 'Усі призначення' }))
    await user.click(screen.getByRole('button', { name: 'Переглянути еталонне відео' }))

    expect(await screen.findByRole('button', { name: 'Сховати відео' })).toBeInTheDocument()
    expect(getExerciseVideoUrl).toHaveBeenCalledWith('exercise-1')
  })

  it('shows an empty state when no exercises have been assigned', async () => {
    renderPatientPage('/patient/exercises', <PatientExercisesPage />)

    expect(
      await screen.findByRole('heading', { name: 'Призначень поки немає' }),
    ).toBeInTheDocument()
  })

  it('saves a completed session with a pain score and confirms success', async () => {
    const user = userEvent.setup()
    vi.mocked(listPatientAssignments).mockResolvedValue([patientAssignment])
    renderPatientPage('/patient/exercises/assignment-1/execute', <PatientExerciseExecutionPage />)

    await user.selectOptions(
      await screen.findByLabelText('Рівень болю після вправи (необов’язково)'),
      '7',
    )
    await user.click(screen.getByRole('button', { name: 'Завершити без відео' }))

    expect(await screen.findByRole('heading', { name: 'Виконання записано' })).toBeInTheDocument()
    expect(completePatientAssignment).toHaveBeenCalledWith('assignment-1', { pain_score: 7 })
  })

  it('saves a completed session without an optional pain score', async () => {
    const user = userEvent.setup()
    vi.mocked(listPatientAssignments).mockResolvedValue([patientAssignment])
    renderPatientPage('/patient/exercises/assignment-1/execute', <PatientExerciseExecutionPage />)

    await user.click(await screen.findByRole('button', { name: 'Завершити без відео' }))

    expect(await screen.findByRole('heading', { name: 'Виконання записано' })).toBeInTheDocument()
    expect(completePatientAssignment).toHaveBeenCalledWith('assignment-1', {})
  })

  it('shows a completion error and leaves the form available for retry', async () => {
    const user = userEvent.setup()
    vi.mocked(listPatientAssignments).mockResolvedValue([patientAssignment])
    vi.mocked(completePatientAssignment).mockRejectedValueOnce(new Error('Збереження не вдалося'))
    renderPatientPage('/patient/exercises/assignment-1/execute', <PatientExerciseExecutionPage />)

    await user.click(await screen.findByRole('button', { name: 'Завершити без відео' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Збереження не вдалося')
    expect(screen.getByRole('button', { name: 'Завершити без відео' })).toBeEnabled()
  })

  it('submits a trimmed question to the doctor after saving the session', async () => {
    const user = userEvent.setup()
    vi.mocked(listPatientAssignments).mockResolvedValue([patientAssignment])
    renderPatientPage('/patient/exercises/assignment-1/execute', <PatientExerciseExecutionPage />)
    await user.click(await screen.findByRole('button', { name: 'Завершити без відео' }))

    await user.type(await screen.findByLabelText('Ваше запитання'), '  Потрібна порада  ')
    await user.click(screen.getByRole('button', { name: 'Надіслати запитання' }))

    expect(await screen.findByText(/Запитання надіслано лікарю/)).toBeInTheDocument()
    expect(createHelpRequest).toHaveBeenCalledWith('session-1', 'Потрібна порада')
  })

  it('reports a failed question submission without clearing the typed message', async () => {
    const user = userEvent.setup()
    vi.mocked(listPatientAssignments).mockResolvedValue([patientAssignment])
    vi.mocked(createHelpRequest).mockRejectedValueOnce(new Error('Не вдалося надіслати запитання'))
    renderPatientPage('/patient/exercises/assignment-1/execute', <PatientExerciseExecutionPage />)
    await user.click(await screen.findByRole('button', { name: 'Завершити без відео' }))
    const question = await screen.findByLabelText('Ваше запитання')
    await user.type(question, 'Допоможіть, будь ласка')
    await user.click(screen.getByRole('button', { name: 'Надіслати запитання' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не вдалося надіслати запитання')
    expect(question).toHaveValue('Допоможіть, будь ласка')
  })

  describe('video analysis', () => {
    const openExecution = async () => {
      vi.mocked(listPatientAssignments).mockResolvedValue([patientAssignment])
      renderPatientPage('/patient/exercises/assignment-1/execute', <PatientExerciseExecutionPage />)
      const user = userEvent.setup()
      const input = await screen.findByLabelText(/Відеофайл/)
      await user.upload(input, new File(['video'], 'squat.mp4', { type: 'video/mp4' }))
      return user
    }

    it('uploads the video, starts the analysis and shows the saved result', async () => {
      const user = await openExecution()
      await user.selectOptions(
        screen.getByLabelText('Рівень болю після вправи (необов’язково)'),
        '3',
      )
      await user.click(screen.getByRole('button', { name: 'Надіслати на аналіз' }))

      expect(await screen.findByRole('heading', { name: 'Виконання записано' })).toBeInTheDocument()
      expect(startComparison).toHaveBeenCalledWith({
        assignment_id: 'assignment-1',
        patient_key: 'videos/u/' + 'c'.repeat(32) + '.mp4',
        pain_score: 3,
      })
      expect(screen.getByText('8.5')).toBeInTheDocument()
      expect(screen.getByText('Праве коліно')).toBeInTheDocument()
      expect(screen.getByText(/Праве коліно: надто зігнуто/)).toBeInTheDocument()
      expect(completePatientAssignment).not.toHaveBeenCalled()
      await waitFor(() => expect(listPatientAssignments).toHaveBeenCalledTimes(2))
    })

    it('lets the patient ask the doctor about the session created by the analysis', async () => {
      const user = await openExecution()
      await user.click(screen.getByRole('button', { name: 'Надіслати на аналіз' }))

      await user.type(await screen.findByLabelText('Ваше запитання'), 'Чи все гаразд?')
      await user.click(screen.getByRole('button', { name: 'Надіслати запитання' }))

      expect(createHelpRequest).toHaveBeenCalledWith('session-9', 'Чи все гаразд?')
    })

    it('waits while the analysis is pending and then shows the result', async () => {
      vi.mocked(getComparison)
        .mockResolvedValueOnce({ ...doneResult, status: 'pending', score: null, session_id: null })
        .mockResolvedValueOnce(doneResult)
      const user = await openExecution()
      await user.click(screen.getByRole('button', { name: 'Надіслати на аналіз' }))

      expect(await screen.findByText(/Аналізуємо відео/)).toBeInTheDocument()
      expect(
        await screen.findByRole('heading', { name: 'Виконання записано' }, { timeout: 6000 }),
      ).toBeInTheDocument()
      expect(getComparison).toHaveBeenCalledTimes(2)
    }, 10000)

    it('asks to record again when the body parts are not visible and saves nothing', async () => {
      vi.mocked(getComparison).mockResolvedValue({
        ...doneResult,
        status: 'rerecord',
        score: null,
        session_id: null,
      })
      const user = await openExecution()
      await user.click(screen.getByRole('button', { name: 'Надіслати на аналіз' }))

      expect(await screen.findByText(/погано видно на відео/)).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Виконання записано' })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Спробувати ще раз' }))

      expect(screen.getByRole('button', { name: 'Надіслати на аналіз' })).toBeDisabled()
    })

    it('explains when no repetitions were found', async () => {
      vi.mocked(getComparison).mockResolvedValue({
        ...doneResult,
        status: 'no_repetitions',
        score: null,
        session_id: null,
      })
      const user = await openExecution()
      await user.click(screen.getByRole('button', { name: 'Надіслати на аналіз' }))

      expect(await screen.findByText(/не вдалося знайти повторень/)).toBeInTheDocument()
    })

    it('tells the patient to finish without a video when the exercise is not set up for analysis', async () => {
      vi.mocked(startComparison).mockRejectedValue(
        new ApiError('conflict', 'conflict', 409, 'The exercise has no reference video yet'),
      )
      const user = await openExecution()
      await user.click(screen.getByRole('button', { name: 'Надіслати на аналіз' }))

      expect(await screen.findByText(/аналіз відео ще не налаштований/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Завершити без відео' })).toBeEnabled()
    })

    it('shows the upload error and does not start the analysis', async () => {
      vi.mocked(uploadVideo).mockRejectedValue(new Error('Максимальний розмір відео — 100 МБ.'))
      const user = await openExecution()
      await user.click(screen.getByRole('button', { name: 'Надіслати на аналіз' }))

      expect(await screen.findByText('Максимальний розмір відео — 100 МБ.')).toBeInTheDocument()
      expect(startComparison).not.toHaveBeenCalled()
    })
  })

  it('shows the analysis details and the video of a saved session', async () => {
    const user = userEvent.setup()
    vi.mocked(getSessionVideoUrl).mockResolvedValue('https://storage.test/session.mp4')
    vi.mocked(listPatientAssignments).mockResolvedValue([
      {
        ...patientAssignment,
        sessions: [
          {
            ...session,
            score: 8.5,
            has_video: true,
            joint_deviations: {
              repetitions: 7,
              joint_scores: { r_knee: 8.1 },
              errors: [],
            },
          },
        ],
      },
    ])
    renderPatientPage('/patient/exercises', <PatientExercisesPage />)
    await user.click(await screen.findByRole('tab', { name: 'Усі призначення' }))

    await user.click(screen.getByText('Сесія 1'))
    expect(screen.getByText('Праве коліно')).toBeInTheDocument()
    expect(screen.getByText('Помилок техніки не виявлено.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Переглянути відео виконання' }))

    expect(await screen.findByRole('button', { name: 'Сховати відео' })).toBeInTheDocument()
    expect(getSessionVideoUrl).toHaveBeenCalledWith('session-1')
  })

  it('shows a workspace error when loading cabinet data fails and retries the request', async () => {
    const user = userEvent.setup()
    vi.mocked(listPatientInvitations).mockRejectedValueOnce(
      new ApiError('Не вдалося завантажити', 'server', 500, 'Internal error detail'),
    )
    renderPatientPage('/patient', <PatientDashboardPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Не вдалося завантажити')
    expect(screen.getByRole('alert')).not.toHaveTextContent('Internal error detail')
    await user.click(screen.getByRole('button', { name: 'Спробувати ще раз' }))

    await waitFor(() => expect(listPatientInvitations).toHaveBeenCalledTimes(2))
  })
})

describe('Local assignment dates', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 22, 23, 59, 59))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('refreshes the patient’s schedule at local midnight', async () => {
    vi.mocked(listPatientAssignments).mockResolvedValue([
      { ...patientAssignment, starts_on: '2026-11-23', weekdays: [0] },
    ])
    await act(async () => {
      renderPatientPage('/patient/exercises', <PatientExercisesPage />)
    })

    expect(screen.getByText('На сьогодні вправ немає')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1_000))

    expect(
      screen.getByRole('heading', { name: patientAssignment.exercise.name }),
    ).toBeInTheDocument()
  })

  it('updates the therapist’s default date and submits a manually selected date', async () => {
    vi.mocked(getPatient).mockResolvedValue(MOCK_PATIENT)
    vi.mocked(listExercises).mockResolvedValue([MOCK_EXERCISE])
    vi.mocked(listAssignments).mockResolvedValue([])
    vi.mocked(listPatientHelpRequests).mockResolvedValue([])
    vi.mocked(getPatientHistory).mockRejectedValue(new ApiError('No history', 'not-found', 404))
    vi.mocked(createAssignment).mockResolvedValue({ ...MOCK_ASSIGNMENT, starts_on: '2026-11-26' })

    await act(async () => {
      render(
        <MemoryRouter initialEntries={[`/therapist/patients/${MOCK_PATIENT.id}`]}>
          <Routes>
            <Route path="/therapist/patients/:patientId" element={<TherapistPatientPage />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    const dateInput = screen.getByLabelText('Початок *')
    expect(dateInput).toHaveValue('2026-11-22')

    vi.setSystemTime(new Date(2026, 10, 23, 0, 1))
    fireEvent.focus(window)
    expect(dateInput).toHaveValue('2026-11-23')

    fireEvent.change(dateInput, { target: { value: '2026-11-26' } })
    vi.setSystemTime(new Date(2026, 10, 24, 0, 1))
    fireEvent.focus(window)
    expect(dateInput).toHaveValue('2026-11-26')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Призначити план' }))
    })

    expect(createAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ starts_on: '2026-11-26' }),
    )
  })
})

describe('Shared account data', () => {
  it('loads the profile once and updates navigation when the profile is refreshed', async () => {
    const user = userEvent.setup()
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/profile']}>
          <TherapistQuestionsProvider>
            <Header />
            <ProfilePage />
          </TherapistQuestionsProvider>
        </MemoryRouter>
      </AuthProvider>,
    )

    expect(await screen.findByText(currentPatient.email)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Мій цикл вправ' })).toBeInTheDocument()
    expect(fetchCurrentUser).toHaveBeenCalledTimes(1)

    vi.mocked(fetchCurrentUser).mockResolvedValueOnce({
      ...currentPatient,
      role: 'therapist',
      email: 'doctor@example.com',
    })
    await user.click(screen.getByRole('button', { name: 'Оновити дані' }))

    expect(await screen.findByText('doctor@example.com')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Пацієнти' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Мій цикл вправ' })).not.toBeInTheDocument()
    expect(fetchCurrentUser).toHaveBeenCalledTimes(2)
  })

  it('updates the shared profile with the automatic role request from registration', async () => {
    window.sessionStorage.setItem('airehab.registration-role', 'therapist')
    vi.mocked(requestTherapistRole).mockResolvedValueOnce({
      ...currentPatient,
      pending_role: 'therapist',
    })
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    )

    expect(await screen.findByRole('heading', { name: /Запит на роль «/ })).toBeInTheDocument()
    expect(requestTherapistRole).toHaveBeenCalledTimes(1)
    expect(fetchCurrentUser).toHaveBeenCalledTimes(1)
  })
})

describe('Therapist workspace', () => {
  it('keeps the patient list visible while refreshing it after a tab switch', async () => {
    const user = userEvent.setup()
    let finishPatients!: (patients: Awaited<ReturnType<typeof listPatients>>) => void
    vi.mocked(listPatients)
      .mockResolvedValueOnce([MOCK_PATIENT])
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishPatients = resolve
          }),
      )
    vi.mocked(listExercises).mockResolvedValue([MOCK_EXERCISE])

    renderWithAuth(
      <StrictMode>
        <Link to="/therapist/patients">До списку пацієнтів</Link>
        <Link to="/therapist/exercises">До бібліотеки</Link>
        <Routes>
          <Route path="/therapist" element={<TherapistWorkspaceLayout />}>
            <Route path="patients" element={<TherapistPatientsPage />} />
            <Route path="exercises" element={<TherapistExercisesPage />} />
          </Route>
        </Routes>
      </StrictMode>,
      createAuth({ authenticated: true, role: 'therapist' }),
      ['/therapist/patients'],
    )

    expect(await screen.findByRole('link', { name: /Олександр Коваленко/ })).toBeInTheDocument()
    expect(listPatients).toHaveBeenCalledTimes(1)
    expect(listExercises).not.toHaveBeenCalled()

    await user.click(screen.getByRole('link', { name: 'До бібліотеки' }))
    expect(await screen.findByRole('heading', { name: MOCK_EXERCISE.name })).toBeInTheDocument()
    expect(listPatients).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('link', { name: 'До списку пацієнтів' }))
    expect(screen.getByRole('link', { name: /Олександр Коваленко/ })).toBeInTheDocument()
    expect(screen.queryByText('Завантажуємо пацієнтів…')).not.toBeInTheDocument()
    expect(listPatients).toHaveBeenCalledTimes(2)
    expect(listExercises).toHaveBeenCalledTimes(1)

    await act(async () => finishPatients([{ ...MOCK_PATIENT, first_name: 'Андрій' }]))
    expect(screen.getByRole('link', { name: /Андрій Коваленко/ })).toBeInTheDocument()
  })
})

describe('Therapist questions', () => {
  it('shares one request and updates the header badge when a reply is sent', async () => {
    const user = userEvent.setup()
    vi.mocked(listNeedsAttention).mockResolvedValueOnce([helpRequest])
    vi.mocked(replyToHelpRequest).mockResolvedValue({
      ...helpRequest,
      reply: 'Так, усе правильно.',
    })
    renderWithAuth(
      <TherapistQuestionsProvider>
        <Header />
        <NeedsAttentionSection />
      </TherapistQuestionsProvider>,
      createAuth({ authenticated: true, role: 'therapist' }),
      ['/therapist/questions'],
    )

    expect(await screen.findByText(helpRequest.message)).toBeInTheDocument()
    expect(screen.getByLabelText('1 нових запитань')).toBeInTheDocument()
    expect(listNeedsAttention).toHaveBeenCalledTimes(1)

    await user.type(
      screen.getByRole('textbox', { name: 'Відповідь пацієнту' }),
      'Так, усе правильно.',
    )
    await user.click(screen.getByRole('button', { name: 'Відповісти' }))

    expect(await screen.findByText('Нових запитань від пацієнтів немає.')).toBeInTheDocument()
    expect(screen.queryByLabelText('1 нових запитань')).not.toBeInTheDocument()
    expect(replyToHelpRequest).toHaveBeenCalledWith(helpRequest.id, 'Так, усе правильно.')
    expect(listNeedsAttention).toHaveBeenCalledTimes(2)
  })
})
