import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ErrorMessage } from '../components/ErrorMessage'
import { ActivityIcon, ArrowRightIcon, ChartIcon, HeartPulseIcon } from '../components/Icons'

const FEATURES = [
  {
    icon: ActivityIcon,
    title: 'AI-аналіз рухів',
    text: 'Комп’ютерний зір оцінює якість виконання вправ і допомагає помічати відхилення, які складно побачити неозброєним оком.',
  },
  {
    icon: HeartPulseIcon,
    title: 'Персональний план',
    text: 'Терапевт призначає вправи з урахуванням стану, цілей і темпу відновлення. Пацієнт бачить зрозумілі кроки на кожен день.',
  },
  {
    icon: ChartIcon,
    title: 'Контроль прогресу',
    text: 'Результати сесій зберігаються в одному місці. Динаміка точності та регулярність занять завжди під рукою у пацієнта й фахівця.',
  },
]

const STEPS = [
  {
    title: 'Увійдіть через Keycloak',
    text: 'Єдиний захищений вхід до кабінету пацієнта або терапевта. Пароль залишається лише в Keycloak.',
  },
  {
    title: 'Отримайте план',
    text: 'Терапевт формує індивідуальну програму та призначає вправи, які відповідають вашому етапу відновлення.',
  },
  {
    title: 'Рухайтеся вперед',
    text: 'Виконуйте заняття, переглядайте результати AI-аналізу та разом із фахівцем коригуйте програму.',
  },
]

export function HomePage() {
  const { authenticated, initError } = useAuth()

  return (
    <div className="home">
      {initError && (
        <div className="home-notice">
          <ErrorMessage
            title="Сервіс входу тимчасово недоступний"
            message={initError}
            onRetry={() => window.location.reload()}
            retryLabel="Перевірити знову"
          />
        </div>
      )}

      <section className="section" aria-labelledby="features-title">
        <div className="section__heading">
          <p className="eyebrow">Можливості платформи</p>
          <h2 id="features-title">Все необхідне для послідовного відновлення</h2>
          <p>
            AIRehab об’єднує роботу пацієнта, терапевта та AI-аналізу в єдиному
            зрозумілому процесі.
          </p>
        </div>

        <div className="feature-grid">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <article className="feature-card" key={title}>
              <span className="feature-card__icon" aria-hidden="true">
                <Icon />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="steps-title">
        <div className="section__heading section__heading--center">
          <p className="eyebrow">Як це працює</p>
          <h2 id="steps-title">Три прості кроки до контрольованого прогресу</h2>
        </div>

        <ol className="steps-grid">
          {STEPS.map((step, index) => (
            <li className="step-card" key={step.title}>
              <span className="step-card__number">{String(index + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="cta-band" aria-labelledby="cta-title">
        <div>
          <p className="eyebrow eyebrow--light">AIRehab</p>
          <h2 id="cta-title">
            {authenticated ? 'Продовжуйте свій шлях до відновлення' : 'Готові почати реабілітацію?'}
          </h2>
          <p>
            {authenticated
              ? 'Усі дані профілю та роль доступні в особистому кабінеті.'
              : 'Створіть захищений обліковий запис через Keycloak і відкрийте персональний кабінет.'}
          </p>
        </div>

        <div className="cta-band__actions">
          {authenticated ? (
            <Link to="/profile" className="button button--light button--lg">
              Відкрити профіль
              <ArrowRightIcon aria-hidden="true" />
            </Link>
          ) : (
            <>
              <Link to="/register" className="button button--light button--lg">
                Зареєструватися
                <ArrowRightIcon aria-hidden="true" />
              </Link>
              <Link to="/login" className="button button--on-dark button--lg">
                Увійти
              </Link>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
