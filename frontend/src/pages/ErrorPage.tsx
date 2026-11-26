import { Link } from 'react-router-dom'
import { ShieldCheckIcon } from '../components/Icons'

interface ErrorPageProps {
  title?: string
  message?: string
  notFound?: boolean
  onRetry?: () => void
}

export function ErrorPage({ title, message, notFound = false, onRetry }: ErrorPageProps) {
  const heading = title ?? (notFound ? 'Сторінку не знайдено' : 'Не вдалося завершити дію')

  const text =
    message ??
    (notFound
      ? 'Можливо, сторінку переміщено або адресу введено з помилкою. Скористайтеся навігацією, щоб продовжити.'
      : 'Спробуйте ще раз')

  return (
    <section className="error-page" aria-labelledby="error-page-title">
      <div className="error-card">
        <span className="error-card__icon" aria-hidden="true">
          <ShieldCheckIcon />
        </span>

        <p className="eyebrow">AIRehab · безпека</p>
        <h1 id="error-page-title">{heading}</h1>
        <p className="error-card__text">{text}</p>

        <div className="error-card__actions">
          <Link to="/" className="button button--primary">
            На головну
          </Link>
          <button
            type="button"
            className="button button--ghost"
            onClick={onRetry ?? (() => window.location.reload())}
          >
            {onRetry ? 'Спробувати ще раз' : 'Оновити сторінку'}
          </button>
        </div>

        {!notFound && (
          <p className="error-card__hint">
            Якщо ви не завершували вхід, просто{' '}
            <Link to="/login" className="text-link">
              увійдіть ще раз
            </Link>
            . Дані профілю захищені та доступні лише після авторизації.
          </p>
        )}
      </div>
    </section>
  )
}
