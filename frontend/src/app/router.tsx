import { createBrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ProtectedRoute } from '../auth/ProtectedRoute'
import { ErrorPage } from '../pages/ErrorPage'
import { LoginPage } from '../pages/LoginPage'
import { ProfilePage } from '../pages/profile/ProfilePage'

import { PatientDashboardPage } from '../pages/patient/PatientDashboardPage'
import { PatientExerciseExecutionPage } from '../pages/patient/PatientExerciseExecutionPage'
import { PatientExercisesPage } from '../pages/patient/PatientExercisesPage'
import { PatientInvitationsPage } from '../pages/patient/PatientInvitationsPage'
import { PatientTherapistsPage } from '../pages/patient/PatientTherapistsPage'
import { PatientWorkspaceLayout } from '../pages/patient/PatientWorkspaceLayout'
import { RegisterPage } from '../pages/RegisterPage'
import { RoleRoute } from '../auth/RoleRoute'
import { TherapistPatientsPage } from '../pages/therapist/TherapistPatientsPage'
import { TherapistPatientPage } from '../pages/therapist/TherapistPatientPage'
import { TherapistExercisesPage } from '../pages/therapist/TherapistExercisesPage'
import { TherapistQuestionsPage } from '../pages/therapist/TherapistQuestionsPage'
import { StartPage } from '../pages/StartPage'
import { TherapistWorkspaceLayout } from '../pages/therapist/TherapistWorkspaceLayout'
import { TherapistQuestionsProvider } from '../lib/TherapistQuestionsProvider'

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <TherapistQuestionsProvider>
        <App />
      </TherapistQuestionsProvider>
    ),
    errorElement: (
      <ErrorPage
        title="Не вдалося відкрити сторінку"
        message="Під час завантаження сторінки сталася неочікувана помилка. Оновіть сторінку або поверніться на головну."
      />
    ),
    children: [
      {
        index: true,
        element: <StartPage />,
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'register',
        element: <RegisterPage />,
      },
      {
        path: 'profile',
        element: (
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'patient',
        element: (
          <RoleRoute allowedRoles={['patient']}>
            <PatientWorkspaceLayout />
          </RoleRoute>
        ),
        children: [
          { index: true, element: <PatientDashboardPage /> },
          { path: 'therapists', element: <PatientTherapistsPage /> },
          { path: 'invitations', element: <PatientInvitationsPage /> },
          { path: 'exercises', element: <PatientExercisesPage /> },
          { path: 'exercises/:assignmentId/execute', element: <PatientExerciseExecutionPage /> },
        ],
      },
      {
        path: 'therapist',
        element: (
          <RoleRoute allowedRoles={['therapist', 'admin']}>
            <TherapistWorkspaceLayout />
          </RoleRoute>
        ),
        children: [
          { index: true, element: <TherapistPatientsPage /> },
          { path: 'patients', element: <TherapistPatientsPage /> },
          { path: 'patients/:patientId', element: <TherapistPatientPage /> },
          { path: 'exercises', element: <TherapistExercisesPage /> },
          { path: 'questions', element: <TherapistQuestionsPage /> },
        ],
      },
      {
        path: 'error',
        element: <ErrorPage />,
      },
      {
        path: '*',
        element: <ErrorPage notFound />,
      },
    ],
  },
])
