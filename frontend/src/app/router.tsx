import { createBrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ProtectedRoute } from '../auth/ProtectedRoute'
import { ErrorPage } from '../pages/ErrorPage'
import { HomePage } from '../pages/HomePage'
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
        element: <HomePage />,
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
          <ProtectedRoute>
            <PatientWorkspaceLayout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <PatientDashboardPage /> },
          { path: 'doctors', element: <PatientDoctorsPage /> },
          { path: 'invitations', element: <PatientInvitationsPage /> },
          { path: 'exercises', element: <PatientExercisesPage /> },
          { path: 'exercises/:exerciseId/execute', element: <PatientExerciseExecutionPage /> },
        ],
        path: 'therapist/patients',
        element: (
          <RoleRoute allowedRoles={['therapist', 'admin']}>
            <TherapistPatientsPage />
          </RoleRoute>
        ),
      },
      {
        path: 'therapist/patients/:patientId',
        element: (
          <RoleRoute allowedRoles={['therapist', 'admin']}>
            <TherapistPatientPage />
          </RoleRoute>
        ),
      },
      {
        path: 'therapist/exercises',
        element: (
          <RoleRoute allowedRoles={['therapist', 'admin']}>
            <TherapistExercisesPage />
          </RoleRoute>
        ),
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
