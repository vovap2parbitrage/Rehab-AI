import { createContext, useContext, useState, type ReactNode } from 'react'

export const DOCTORS = [
  {
    id: 'olena-koval',
    name: 'Олена Коваль',
    specialty: 'Фізична терапія',
    experience: '8 років досвіду',
    description: 'Допомагає відновити рухливість і силу після травм та операцій.',
    initials: 'ОК',
  },
  {
    id: 'andrii-melnyk',
    name: 'Андрій Мельник',
    specialty: 'Неврологічна реабілітація',
    experience: '11 років досвіду',
    description: 'Працює з відновленням координації, балансу та ходи.',
    initials: 'АМ',
  },
  {
    id: 'maria-shevchenko',
    name: 'Марія Шевченко',
    specialty: 'Реабілітація опорно-рухового апарату',
    experience: '6 років досвіду',
    description: 'Складає поступові програми відновлення з урахуванням вашого темпу.',
    initials: 'МШ',
  },
] as const

export const EXERCISES = [
  {
    id: 'ankle-mobility',
    title: 'Рухливість гомілковостопного суглоба',
    description: 'Повільно тягніть стопу на себе та від себе, не затримуючи дихання.',
    prescription: '2 підходи · 10 повторень',
    duration: '5 хв',
  },
  {
    id: 'seated-knee-extension',
    title: 'Розгинання ноги сидячи',
    description: 'Розігніть ногу до комфортного положення та повільно поверніть назад.',
    prescription: '3 підходи · 8 повторень',
    duration: '7 хв',
  },
  {
    id: 'supported-heel-raise',
    title: 'Підйом на носки з опорою',
    description: 'Тримайтеся за стійку опору та піднімайте п’яти без різких рухів.',
    prescription: '2 підходи · 10 повторень',
    duration: '5 хв',
  },
  {
    id: 'breathing',
    title: 'Спокійне діафрагмальне дихання',
    description: 'Зробіть повільний вдих носом і довший видих через злегка стиснуті губи.',
    prescription: '2 підходи · 6 циклів',
    duration: '4 хв',
  },
] as const

export type DoctorId = (typeof DOCTORS)[number]['id']
export type ExerciseId = (typeof EXERCISES)[number]['id']
export type InvitationStatus = 'pending' | 'accepted' | 'declined'

interface PatientWorkspaceState {
  invitationDoctorId: DoctorId | null
  invitationStatus: InvitationStatus | null
  completedExerciseIds: ExerciseId[]
}

interface PatientWorkspaceContextValue {
  state: PatientWorkspaceState
  storageError: string | null
  acceptInvitation: () => void
  declineInvitation: () => void
  completeExercise: (exerciseId: ExerciseId) => void
}

const STORAGE_KEY = 'airehab.patient-workspace.v2'
const DEMO_INVITATION: PatientWorkspaceState = {
  invitationDoctorId: 'olena-koval',
  invitationStatus: 'pending',
  completedExerciseIds: [],
}

const PatientWorkspaceContext = createContext<PatientWorkspaceContextValue | null>(null)

function isDoctorId(value: unknown): value is DoctorId {
  return DOCTORS.some((doctor) => doctor.id === value)
}

function isExerciseId(value: unknown): value is ExerciseId {
  return EXERCISES.some((exercise) => exercise.id === value)
}

function isInvitationStatus(value: unknown): value is InvitationStatus {
  return value === 'pending' || value === 'accepted' || value === 'declined'
}

function loadWorkspace(): { state: PatientWorkspaceState; error: string | null } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { state: DEMO_INVITATION, error: null }

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid local workspace data')
    }

    const stored = parsed as Record<string, unknown>
    const invitationDoctorId = isDoctorId(stored.invitationDoctorId)
      ? stored.invitationDoctorId
      : null
    const invitationStatus =
      invitationDoctorId && isInvitationStatus(stored.invitationStatus)
        ? stored.invitationStatus
        : null
    const completedExerciseIds = Array.isArray(stored.completedExerciseIds)
      ? stored.completedExerciseIds.filter(isExerciseId)
      : []

    return {
      state: { invitationDoctorId, invitationStatus, completedExerciseIds },
      error: null,
    }
  } catch {
    return {
      state: DEMO_INVITATION,
      error:
        'Не вдалося прочитати демо-дані з браузера. Зміни працюватимуть лише до перезавантаження.',
    }
  }
}

export function PatientWorkspaceProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(loadWorkspace)
  const [state, setState] = useState(initial.state)
  const [storageError, setStorageError] = useState(initial.error)

  const save = (next: PatientWorkspaceState) => {
    setState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setStorageError(null)
    } catch {
      setStorageError(
        'Браузер не зберіг демо-дані. Після перезавантаження сторінки зміни можуть зникнути.',
      )
    }
  }

  const value: PatientWorkspaceContextValue = {
    state,
    storageError,
    acceptInvitation: () => {
      if (state.invitationStatus !== 'pending') return
      save({ ...state, invitationStatus: 'accepted' })
    },
    declineInvitation: () => {
      if (state.invitationStatus !== 'pending') return
      save({ ...state, invitationStatus: 'declined' })
    },
    completeExercise: (exerciseId) => {
      if (state.invitationStatus !== 'accepted') return
      if (state.completedExerciseIds.includes(exerciseId)) return
      const completedExerciseIds = [...state.completedExerciseIds, exerciseId]
      save({ ...state, completedExerciseIds })
    },
  }

  return <PatientWorkspaceContext.Provider value={value}>{children}</PatientWorkspaceContext.Provider>
}

export function usePatientWorkspace(): PatientWorkspaceContextValue {
  const context = useContext(PatientWorkspaceContext)
  if (!context) {
    throw new Error('usePatientWorkspace must be used inside PatientWorkspaceProvider')
  }
  return context
}
