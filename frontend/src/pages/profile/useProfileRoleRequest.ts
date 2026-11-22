import { useCallback, useEffect, useRef, useState } from 'react'
import { requestTherapistRole } from '../../api/auth'
import { useAuth } from '../../auth/useAuth'
import { getErrorMessage } from '../../lib/errorMessage'
import { consumeRegistrationRole } from '../../lib/registrationRole'

export function useProfileRoleRequest() {
  const { user, userLoading, userError, updateUser } = useAuth()
  const requestInFlight = useRef(false)
  const [isRequestingRole, setIsRequestingRole] = useState(false)
  const [roleRequestError, setRoleRequestError] = useState<string | null>(null)
  const [roleRequestSuccess, setRoleRequestSuccess] = useState<string | null>(null)

  const submitRoleRequest = useCallback(
    async (fromRegistration: boolean) => {
      if (requestInFlight.current) return
      requestInFlight.current = true
      setIsRequestingRole(true)
      setRoleRequestError(null)
      setRoleRequestSuccess(null)

      try {
        const updated = await requestTherapistRole()
        updateUser(updated)
        setRoleRequestSuccess(
          fromRegistration
            ? 'Ви обрали роль лікаря під час реєстрації. Запит на роль терапевта надіслано — адміністратор розгляне його найближчим часом.'
            : 'Запит на роль терапевта надіслано. Адміністратор розгляне його найближчим часом.',
        )
      } catch (caught) {
        setRoleRequestError(
          getErrorMessage(caught, 'Не вдалося надіслати запит на роль терапевта.'),
        )
      } finally {
        requestInFlight.current = false
        setIsRequestingRole(false)
      }
    },
    [updateUser],
  )

  useEffect(() => {
    if (!user || userLoading || userError) return

    let active = true
    queueMicrotask(() => {
      if (!active) return
      const intent = consumeRegistrationRole()
      if (
        intent === 'therapist' &&
        user.role === 'patient' &&
        user.pending_role === null &&
        user.is_active
      ) {
        void submitRoleRequest(true)
      }
    })

    return () => {
      active = false
    }
  }, [submitRoleRequest, user, userError, userLoading])

  return {
    isRequestingRole,
    roleRequestError,
    roleRequestSuccess,
    handleRoleRequest: () => submitRoleRequest(false),
  }
}
