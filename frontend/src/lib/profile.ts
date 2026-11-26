import type { UserProfile } from '../api/auth'

type NamedUser = Pick<UserProfile, 'first_name' | 'last_name' | 'email'> | null | undefined

export function getFirstName(user: NamedUser): string {
  return user?.first_name?.trim() ?? ''
}

export function getLastName(user: NamedUser): string {
  return user?.last_name?.trim() ?? ''
}

export function getDisplayName(user: NamedUser): string {
  const fullName = [getFirstName(user), getLastName(user)].filter(Boolean).join(' ')

  if (fullName) {
    return fullName
  }

  const email = user?.email.trim()
  if (email) {
    return email.split('@')[0] ?? email
  }

  return 'Користувач AIRehab'
}

export function getInitials(displayName: string): string {
  const words = displayName
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)

  if (words.length === 0) {
    return '?'
  }

  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase('uk-UA'))
    .join('')
}

export function getRoleLabel(role: string): string {
  switch (role) {
    case 'patient':
      return 'Пацієнт'
    case 'therapist':
      return 'Лікар'
    default:
      return role || 'Невідома роль'
  }
}

export function getRoleDescription(role: string): string {
  switch (role) {
    case 'patient':
      return 'Доступ до власного плану реабілітації, вправ та історії занять.'
    case 'therapist':
      return 'Робота з пацієнтами, призначення вправ і контроль прогресу.'
    default:
      return 'Роль визначена сервером AIRehab.'
  }
}
