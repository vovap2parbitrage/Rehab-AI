import type { KeycloakTokenParsed } from 'keycloak-js'

type TokenClaims = KeycloakTokenParsed | null | undefined

function claim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function getFirstName(tokenParsed: TokenClaims): string {
  return claim(tokenParsed?.given_name)
}

export function getLastName(tokenParsed: TokenClaims): string {
  return claim(tokenParsed?.family_name)
}

export function getUsername(tokenParsed: TokenClaims): string {
  return claim(tokenParsed?.preferred_username)
}

export function getDisplayName(tokenParsed: TokenClaims): string {
  const fullName = [getFirstName(tokenParsed), getLastName(tokenParsed)]
    .filter(Boolean)
    .join(' ')

  if (fullName) {
    return fullName
  }

  const name = claim(tokenParsed?.name)
  if (name) {
    return name
  }

  const username = getUsername(tokenParsed)
  if (username) {
    return username
  }

  const email = claim(tokenParsed?.email)
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
    case 'admin':
      return 'Адміністратор'
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
    case 'admin':
      return 'Керування користувачами, ролями та доступом до платформи.'
    default:
      return 'Роль визначена сервером AIRehab.'
  }
}
