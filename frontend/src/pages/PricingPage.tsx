import { useState } from 'react'
import { Link } from 'react-router-dom'
import { listPlans, getMyPlan, purchasePlan, type Plan } from '../api/plans'
import { useAuth } from '../auth/useAuth'
import { EmptyState } from '../components/EmptyState'
import { ErrorMessage } from '../components/ErrorMessage'
import { CheckIcon } from '../components/Icons'
import { Loading } from '../components/Loading'
import { PageHeading } from '../components/PageHeading'
import { getErrorMessage } from '../lib/errorMessage'
import { useCachedResource, useRefreshOnEntry } from '../lib/useCachedResource'

function formatPrice(plan: Plan): string {
  return plan.price_uah === 0 ? 'Безкоштовно' : `${plan.price_uah} ₴ / міс`
}

export function PricingPage() {
  const { authenticated, role } = useAuth()
  const isTherapist = authenticated && role === 'therapist'
  const plans = useCachedResource(listPlans, 'Не вдалося завантажити тарифи.')
  const myPlan = useCachedResource(getMyPlan, 'Не вдалося завантажити ваш тариф.')
  useRefreshOnEntry(plans)
  useRefreshOnEntry(myPlan, isTherapist)
  const [busyPlan, setBusyPlan] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const currentCode = isTherapist ? myPlan.data?.plan : undefined

  const handleChoose = async (plan: Plan) => {
    const question =
      plan.price_uah === 0
        ? `Перейти на тариф «${plan.name}»?`
        : `Оформити тариф «${plan.name}» за ${plan.price_uah} ₴ / міс?\n\nОплата тестова: кошти не списуються.`
    if (!window.confirm(question)) return
    setBusyPlan(plan.code)
    setNotice(null)
    setError(null)
    try {
      await purchasePlan(plan.code)
      myPlan.invalidate()
      setNotice(`Тариф «${plan.name}» активовано.`)
    } catch (reason: unknown) {
      setError(getErrorMessage(reason, 'Не вдалося оформити тариф.'))
    } finally {
      setBusyPlan(null)
    }
  }

  return (
    <div className="pricing">
      <PageHeading
        eyebrow="Тарифи"
        title="Оберіть тариф для своєї практики"
        lead="Тариф визначає, скільки активних пацієнтів ви можете вести одночасно. Заархівовані пацієнти в ліміт не входять."
      />

      {notice && (
        <div className="success-message" role="status">
          {notice}
        </div>
      )}
      {error && <ErrorMessage title="Не вдалося оформити тариф" message={error} />}

      {plans.loading && !plans.data && <Loading label="Завантажуємо тарифи…" />}
      {plans.error && (
        <ErrorMessage message={plans.error} onRetry={() => void plans.load({ refresh: true })} />
      )}
      {plans.data && plans.data.length === 0 && <EmptyState message="Тарифів поки немає." />}

      {plans.data && plans.data.length > 0 && (
        <div className="pricing-grid">
          {plans.data.map((plan) => {
            const current = plan.code === currentCode
            return (
              <article
                className={current ? 'pricing-card pricing-card--current' : 'pricing-card'}
                key={plan.code}
              >
                <h2>{plan.name}</h2>
                <p className="pricing-card__price">{formatPrice(plan)}</p>
                <ul className="pricing-card__features">
                  <li>
                    <CheckIcon aria-hidden="true" /> До {plan.max_active_patients} активних
                    пацієнтів
                  </li>
                  <li>
                    <CheckIcon aria-hidden="true" /> Призначення вправ та AI-аналіз виконання
                  </li>
                  <li>
                    <CheckIcon aria-hidden="true" /> Історія і відповіді на запитання пацієнтів
                  </li>
                </ul>
                {!authenticated ? (
                  <Link
                    to="/login"
                    state={{ from: '/pricing' }}
                    className="button button--ghost pricing-card__action"
                  >
                    Увійти, щоб обрати
                  </Link>
                ) : isTherapist ? (
                  current ? (
                    <span className="status-pill status-pill--success pricing-card__action">
                      Ваш тариф
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="button button--primary pricing-card__action"
                      disabled={busyPlan !== null || myPlan.data === undefined}
                      onClick={() => void handleChoose(plan)}
                    >
                      {busyPlan === plan.code ? 'Оформлюємо…' : 'Обрати тариф'}
                    </button>
                  )
                ) : null}
              </article>
            )
          })}
        </div>
      )}

      <p className="pricing__note">
        Оплата працює в тестовому режимі: тариф активується одразу, кошти не списуються.
      </p>
    </div>
  )
}
