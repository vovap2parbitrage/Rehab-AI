import { ErrorMessage } from '../../components/ErrorMessage'
import { CheckIcon } from '../../components/Icons'

interface ProfileRoleStatusProps {
  roleError: string | null
  roleSuccess: string | null
  isApplyingRole: boolean
  onRetry: () => void
}

export function ProfileRoleStatus({
  roleError,
  roleSuccess,
  isApplyingRole,
  onRetry,
}: ProfileRoleStatusProps) {
  return (
    <>
      {isApplyingRole && (
        <div className="info-note" role="status">
          Активуємо роль лікаря…
        </div>
      )}

      {roleSuccess && (
        <div className="success-message" role="status">
          <CheckIcon aria-hidden="true" />
          <span>{roleSuccess}</span>
        </div>
      )}

      {roleError && (
        <ErrorMessage
          title="Не вдалося активувати роль лікаря"
          message={roleError}
          onRetry={onRetry}
        />
      )}
    </>
  )
}
