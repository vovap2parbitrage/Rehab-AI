import type { ReactNode } from 'react'
import { AlertTriangleIcon } from './Icons'

interface ErrorMessageProps {
  title?: string
  message: string
  code?: string | number
  onRetry?: () => void
  retryLabel?: string
  children?: ReactNode
}

export function ErrorMessage({
  title = 'Сталася помилка',
  message,
  code,
  onRetry,
  retryLabel = 'Спробувати ще раз',
  children,
}: ErrorMessageProps) {
  return (
    <div className="error-message" role="alert">
      <span className="error-message__icon" aria-hidden="true">
        <AlertTriangleIcon />
      </span>

      <div className="error-message__content">
        <h2 className="error-message__title">{title}</h2>
        <p className="error-message__text">{message}</p>

        {code !== undefined && (
          <p className="error-message__code">
            Код помилки: <code>{code}</code>
          </p>
        )}

        {(onRetry || children) && (
          <div className="error-message__actions">
            {onRetry && (
              <button type="button" className="button button--ghost button--sm" onClick={onRetry}>
                {retryLabel}
              </button>
            )}
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
