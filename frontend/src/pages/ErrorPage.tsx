import { Link, useSearchParams } from 'react-router-dom'
import { describeAuthErrorCode } from '../auth/errors'
import { ShieldCheckIcon } from '../components/Icons'

interface ErrorPageProps {
  title?: string
  message?: string
  code?: string
  notFound?: boolean
}

export function ErrorPage({ title, message, code, notFound = false }: ErrorPageProps) {
  const [searchParams] = useSearchParams()
  const errorCode = code ?? searchParams.get('error') ?? searchParams.get('code')
  const description = errorCode ? describeAuthErrorCode(errorCode) : null

  const heading =
    title ??
    (notFound
      ? 'Сторінку не знайдено'
      : (description?.title ?? 'Не вдалося завершити дію'))

  const text =
    message ??
    (notFound
      ? 'Можливо, сторінку переміщено або адресу введено з помилкою. Скористайтеся навігацією, щоб продовжити.'
      : (description?.message ??
        'Спробуйте ще раз. Якщо проблема повторюється, перевірте налаштування Keycloak і backend AIRehab.'))

  return (
    <section className="error-page" aria-labelledby="error-page-title">
      <div className="error-card">
        <span className="error-card__icon" aria-hidden="true">
          <ShieldCheckIcon />
        </span>

        <p className="eyebrow">AIRehab · безпека</p>
        <h1 id="error-page-title">{heading}</h1>
        <p className="error-card__text">{text}</p>

        {errorCode && !notFound && (
          <p className="error-card__code">
            Технічний код: <code>{errorCode}</code>
          </p>
        )}

        <div className="error-card__actions">
          <Link to="/" className="button button--primary">
            На головну
          </Link>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => window.location.reload()}
          >
            Оновити сторінку
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
