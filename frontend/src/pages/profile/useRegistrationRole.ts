import { useCallback, useEffect, useRef, useState } from 'react'
import { chooseTherapistRole } from '../../api/auth'
import { refreshAccessToken } from '../../auth/keycloak'
import { useAuth } from '../../auth/useAuth'
import { getErrorMessage } from '../../lib/errorMessage'
import { consumeRegistrationRole } from '../../lib/registrationRole'

/**
 * Applies the role chosen on the registration page. A therapist gets the role at once:
 * the backend grants it in Keycloak, then the token is refreshed so it carries the new role.
 */
export function useRegistrationRole() {
  const { user, userLoading, userError, updateUser } = useAuth()
  const requestInFlight = useRef(false)
  const [isApplyingRole, setIsApplyingRole] = useState(false)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [roleSuccess, setRoleSuccess] = useState<string | null>(null)

  const applyTherapistRole = useCallback(async () => {
    if (requestInFlight.current) return
    requestInFlight.current = true
    setIsApplyingRole(true)
    setRoleError(null)
    setRoleSuccess(null)

    try {
      const updated = await chooseTherapistRole()
      await refreshAccessToken()
      updateUser(updated)
      setRoleSuccess('Ви зареєстровані як лікар. Кабінет лікаря вже доступний.')
    } catch (caught) {
      setRoleError(getErrorMessage(caught, 'Не вдалося активувати роль лікаря.'))
    } finally {
      requestInFlight.current = false
      setIsApplyingRole(false)
    }
  }, [updateUser])

  useEffect(() => {
    if (!user || userLoading || userError) return

    let active = true
    queueMicrotask(() => {
      if (!active) return
      const intent = consumeRegistrationRole()
      if (intent === 'therapist' && user.role === 'patient' && user.is_active) {
        void applyTherapistRole()
      }
    })

    return () => {
      active = false
    }
  }, [applyTherapistRole, user, userError, userLoading])

  return { isApplyingRole, roleError, roleSuccess, retryRole: applyTherapistRole }
}
