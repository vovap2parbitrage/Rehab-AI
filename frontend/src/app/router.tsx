import { createBrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ProtectedRoute } from '../auth/ProtectedRoute'
import { ErrorPage } from '../pages/ErrorPage'
import { LoginPage } from '../pages/LoginPage'
import { ProfilePage } from '../pages/ProfilePage'
import {
  PatientDashboardPage,
  PatientDoctorsPage,
  PatientExerciseExecutionPage,
  PatientExercisesPage,
  PatientInvitationsPage,
} from '../pages/PatientWorkspacePages'
import { PatientWorkspaceLayout } from '../pages/PatientWorkspaceLayout'
import { RegisterPage } from '../pages/RegisterPage'
import { RoleRoute } from '../auth/RoleRoute'
import { TherapistPatientsPage } from '../pages/TherapistPatientsPage'
import { TherapistPatientPage } from '../pages/TherapistPatientPage'
import { TherapistExercisesPage } from '../pages/TherapistExercisesPage'
import { StartPage } from '../pages/StartPage'
import { TherapistWorkspaceLayout } from '../pages/TherapistWorkspaceLayout'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
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
          { path: 'doctors', element: <PatientDoctorsPage /> },
          { path: 'invitations', element: <PatientInvitationsPage /> },
          { path: 'exercises', element: <PatientExercisesPage /> },
          { path: 'exercises/:exerciseId/execute', element: <PatientExerciseExecutionPage /> },
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
