import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ActivityIcon, ArrowRightIcon, CheckIcon, ClockIcon, UserIcon } from '../components/Icons'
import { Loading } from '../components/Loading'
import { usePatientWorkspace } from '../lib/usePatientWorkspace'
import { getDisplayName } from '../lib/profile'

function PageHeading({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return (
    <header className="page-heading workspace-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-heading__lead">{lead}</p>
      </div>
    </header>
  )
}

function WorkspaceError() {
  const { error, refresh } = usePatientWorkspace()
  if (!error) return null

  return (
    <div className="workspace-error" role="alert">
      <span>{error}</span>
      <button type="button" className="button button--ghost" onClick={refresh}>
        Спробувати ще раз
      </button>
    </div>
  )
}

function formatDate(value: string | null): string {
  if (!value) return 'Без кінцевої дати'
  return new Date(`${value}T00:00:00`).toLocaleDateString('uk-UA')
}

function getInitials(email: string): string {
  return email
    .split('@')[0]
    .split(/[._-]/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toLocaleUpperCase('uk-UA')
}

export function PatientDashboardPage() {
  const { tokenParsed } = useAuth()
  const { invitations, assignments, loading } = usePatientWorkspace()
  const displayName = getDisplayName(tokenParsed)
  const pendingInvitation = invitations.find((invitation) => invitation.status === 'pending')
  const acceptedInvitations = invitations.filter((invitation) => invitation.status === 'accepted')
  const completedSessions = assignments.reduce(
    (total, assignment) => total + assignment.sessions.length,
    0,
  )
  const activeAssignments = assignments.filter((assignment) => assignment.status === 'active')

  return (
    <div className="workspace-page">
      <PageHeading
        eyebrow="Кабінет пацієнта"
        title={`Вітаємо, ${displayName}`}
        lead="Ваші лікарі, запрошення та призначення — в одному місці."
      />
      <WorkspaceError />
      {loading ? (
        <Loading label="Завантажуємо ваш кабінет…" />
      ) : (
        <>
          <section className="workspace-welcome card" aria-labelledby="welcome-title">
            <div className="workspace-welcome__copy">
              <p className="eyebrow">Ваш наступний крок</p>
              <h2 id="welcome-title">
                {pendingInvitation
                  ? 'Вам надійшло запрошення'
                  : acceptedInvitations.length
                    ? 'Ваш план відновлення'
                    : 'Очікуйте запрошення від лікаря'}
              </h2>
              <p>
                {pendingInvitation
                  ? `${pendingInvitation.therapist_email} надіслав запрошення до співпраці. Перегляньте його та прийміть або відхиліть.`
                  : acceptedInvitations.length
                    ? 'Перегляньте призначення та зафіксуйте кожне виконане заняття.'
                    : 'Коли лікар надішле запрошення, воно з’явиться у цьому кабінеті.'}
              </p>
              <Link
                className="button button--primary"
                to={pendingInvitation ? '/patient/invitations' : '/patient/exercises'}
              >
                {pendingInvitation
                  ? 'Переглянути запрошення'
                  : 'Відкрити призначення'}
                <ArrowRightIcon aria-hidden="true" />
              </Link>
            </div>
            <div className="workspace-welcome__illustration" aria-hidden="true">
              <ActivityIcon />
            </div>
          </section>

          <div className="workspace-summary-grid">
            <section className="card workspace-summary-card" aria-labelledby="therapist-summary-title">
              <span className="workspace-summary-card__icon">
                <UserIcon aria-hidden="true" />
              </span>
              <p className="eyebrow">Мої лікарі</p>
              <h2 id="therapist-summary-title">{acceptedInvitations.length || 'Поки немає'}</h2>
              <p>
                {pendingInvitation
                  ? `Нове запрошення від ${pendingInvitation.therapist_email}`
                  : 'Прийміть запрошення, щоб почати співпрацю.'}
              </p>
              <Link to="/patient/invitations" className="text-link">
                Переглянути запрошення
              </Link>
            </section>

            <section className="card workspace-summary-card" aria-labelledby="exercise-summary-title">
              <span className="workspace-summary-card__icon workspace-summary-card__icon--teal">
                <CheckIcon aria-hidden="true" />
              </span>
              <p className="eyebrow">Призначення</p>
              <h2 id="exercise-summary-title">
                {completedSessions} виконаних сесій
              </h2>
              <p>{activeAssignments.length} активних призначень</p>
              <Link to="/patient/exercises" className="text-link">
                Відкрити призначення
              </Link>
            </section>
          </div>
        </>
      )}
    </div>
  )
}

export function PatientTherapistsPage() {
  const { therapists, invitations, loading } = usePatientWorkspace()
  const connectedTherapists = new Set(
    invitations
      .filter((invitation) => invitation.status === 'accepted')
      .map((invitation) => invitation.therapist_id),
  )

  return (
    <div className="workspace-page">
      <PageHeading
        eyebrow="Мої лікарі"
        title="Лікарі, які вас лікують"
        lead="Тут показані лікарі, прив’язані до вашого профілю."
      />
      <WorkspaceError />
      {loading ? (
        <Loading label="Завантажуємо список лікарів…" />
      ) : therapists.length ? (
        <div className="therapist-grid">
          {therapists.map((therapist) => (
            <article className="card therapist-card" key={therapist.id}>
              <div className="therapist-card__top">
                <span className="avatar avatar--md" aria-hidden="true">
                  {getInitials(therapist.email)}
                </span>
                <span className="therapist-card__experience">
                  Ваш лікар
                </span>
              </div>
              <h2>{therapist.email}</h2>
              <p className="therapist-card__description">
                {connectedTherapists.has(therapist.id)
                  ? 'Ви прийняли запрошення цього лікаря.'
                  : 'Лікар прив’язаний до вашого профілю.'}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <section className="card workspace-empty-state">
          <span className="workspace-empty-state__icon" aria-hidden="true">
            <UserIcon />
          </span>
          <h2>У вас ще немає лікарів</h2>
          <p>Коли лікар почне з вами працювати, він з’явиться у цьому списку.</p>
        </section>
      )}
    </div>
  )
}

export function PatientInvitationsPage() {
  const { invitations, loading, actionPending, respondToInvitation } = usePatientWorkspace()

  const statusLabel = {
    pending: 'Нове запрошення',
    accepted: 'Запрошення прийнято',
    declined: 'Запрошення відхилено',
    revoked: 'Лікар скасував запрошення',
  } as const

  return (
    <div className="workspace-page">
      <PageHeading
        eyebrow="Зв’язок із фахівцем"
        title="Запрошення від лікарів"
        lead="Прийміть або відхиліть запрошення. Якщо лікар його скасує, відповідь уже буде недоступна."
      />
      <WorkspaceError />
      {loading ? (
        <Loading label="Завантажуємо запрошення…" />
      ) : invitations.length ? (
        <div className="patient-invitation-list">
          {invitations.map((invitation) => {
            const isPending = invitation.status === 'pending'
            const isAccepted = invitation.status === 'accepted'
            const busy = actionPending === invitation.id

            return (
              <section className="card invitation-card" key={invitation.id}>
                <div className="invitation-card__icon" aria-hidden="true">
                  {isPending ? <ClockIcon /> : isAccepted ? <CheckIcon /> : <UserIcon />}
                </div>
                <div className="invitation-card__body">
                  <span
                    className={
                      isPending
                        ? 'status-pill status-pill--pending'
                        : isAccepted
                          ? 'status-pill status-pill--success status-pill--sm'
                          : 'status-pill status-pill--danger status-pill--sm'
                    }
                  >
                    <span className="status-pill__dot" aria-hidden="true" />
                    {statusLabel[invitation.status]}
                  </span>
                  <h2>{invitation.therapist_email}</h2>
                  <p>
                    {isPending
                      ? 'Лікар запрошує вас до співпраці. Прийміть запрошення, щоб почати роботу.'
                      : isAccepted
                        ? 'Запрошення прийнято. Перегляньте призначення цього фахівця.'
                        : invitation.status === 'revoked'
                          ? 'Запрошення більше не дійсне. За потреби лікар може надіслати нове.'
                          : 'Ви відхилили це запрошення. За потреби лікар може надіслати нове.'}
                  </p>
                  {invitation.message && (
                    <p className="invitation-card__specialty">{invitation.message}</p>
                  )}
                  <p className="patient-invitation-date">
                    Надіслано: {new Date(invitation.created_at).toLocaleString('uk-UA')}
                  </p>
                  <div className="invitation-card__actions">
                    {isPending ? (
                      <>
                        <button
                          type="button"
                          className="button button--primary"
                          disabled={busy}
                          onClick={() => respondToInvitation(invitation.id, 'accepted')}
                        >
                          <CheckIcon aria-hidden="true" /> Прийняти запрошення
                        </button>
                        <button
                          type="button"
                          className="button button--ghost"
                          disabled={busy}
                          onClick={() => respondToInvitation(invitation.id, 'declined')}
                        >
                          Відхилити
                        </button>
                      </>
                    ) : isAccepted ? (
                      <Link to="/patient/exercises" className="button button--primary">
                        Перейти до призначень <ArrowRightIcon aria-hidden="true" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <section className="card workspace-empty-state">
          <span className="workspace-empty-state__icon" aria-hidden="true">
            <UserIcon />
          </span>
          <h2>Поки немає запрошень</h2>
          <p>Коли лікар надішле запрошення, воно з’явиться тут.</p>
          <Link to="/patient/therapists" className="button button--primary">
            Переглянути лікарів <ArrowRightIcon aria-hidden="true" />
          </Link>
        </section>
      )}
    </div>
  )
}

export function PatientExercisesPage() {
  const { assignments, loading } = usePatientWorkspace()

  return (
    <div className="workspace-page">
      <PageHeading
        eyebrow="План відновлення"
        title="Мої призначення"
        lead="Переглядайте план лікаря та зберігайте кожну виконану сесію."
      />
      <WorkspaceError />
      {loading ? (
        <Loading label="Завантажуємо призначення…" />
      ) : assignments.length ? (
        <div className="exercise-list">
          {assignments.map((assignment) => (
            <article className="card exercise-card" key={assignment.id}>
              <span className="exercise-card__icon" aria-hidden="true">
                <ActivityIcon />
              </span>
              <div className="exercise-card__content">
                <div className="exercise-card__title-row">
                  <h2>{assignment.exercise.name}</h2>
                  <span
                    className={
                      assignment.status === 'active'
                        ? 'status-pill status-pill--success status-pill--sm'
                        : 'status-pill status-pill--danger status-pill--sm'
                    }
                  >
                    {assignment.status === 'active' ? 'Активне' : 'Неактивне'}
                  </span>
                </div>
                <p>{assignment.exercise.description ?? 'Опис вправи не додано.'}</p>
                <div className="exercise-card__meta">
                  <span>
                    {assignment.sessions_per_week} занять на тиждень · {assignment.repetitions}{' '}
                    повторень
                  </span>
                  <span>
                    {assignment.sessions.length} сесій · до {formatDate(assignment.ends_on)}
                  </span>
                </div>
              </div>
              {assignment.status === 'active' && (
                <Link
                  to={`/patient/exercises/${assignment.id}/execute`}
                  className="button button--primary exercise-card__action"
                >
                  Виконати вправу <ArrowRightIcon aria-hidden="true" />
                </Link>
              )}
            </article>
          ))}
        </div>
      ) : (
        <section className="card workspace-empty-state">
          <span className="workspace-empty-state__icon" aria-hidden="true">
            <ClockIcon />
          </span>
          <h2>Призначень поки немає</h2>
          <p>Коли лікар додасть вправу до вашого плану, вона з’явиться тут.</p>
          <Link to="/patient/invitations" className="button button--primary">
            Переглянути запрошення <ArrowRightIcon aria-hidden="true" />
          </Link>
        </section>
      )}
    </div>
  )
}

export function PatientExerciseExecutionPage() {
  const { assignmentId } = useParams()
  const { assignments, loading, actionPending, completeAssignment } = usePatientWorkspace()
  const [painScore, setPainScore] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const assignment = assignments.find((item) => item.id === assignmentId)
  const saving = actionPending === assignmentId

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!assignmentId) return
    const saved = await completeAssignment(
      assignmentId,
      painScore === '' ? null : Number(painScore),
    )
    if (saved) setSubmitted(true)
  }

  if (loading) return <Loading label="Завантажуємо призначення…" />
  if (!assignment) {
    return (
      <div className="workspace-page">
        <WorkspaceError />
        <section className="card workspace-empty-state">
          <h2>Призначення не знайдено</h2>
          <p>Можливо, лікар видалив його або воно більше недоступне.</p>
          <Link to="/patient/exercises" className="button button--primary">
            До призначень <ArrowRightIcon aria-hidden="true" />
          </Link>
        </section>
      </div>
    )
  }

  return (
    <div className="workspace-page">
      <Link to="/patient/exercises" className="text-link exercise-execution__back">
        ← Повернутися до призначень
      </Link>
      <PageHeading
        eyebrow="Виконання вправи"
        title={assignment.exercise.name}
        lead="Після заняття зафіксуйте виконану сесію у своєму плані."
      />
      <WorkspaceError />

      <section className="card exercise-execution__details" aria-labelledby="execution-instructions">
        <div>
          <p className="eyebrow">Призначення лікаря</p>
          <h2 id="execution-instructions">{assignment.repetitions} повторень</h2>
          <p>{assignment.exercise.description ?? 'Лікар не додав опис до цієї вправи.'}</p>
        </div>
        <span className="exercise-execution__duration">
          <ClockIcon aria-hidden="true" />
          {assignment.sessions_per_week} занять на тиждень
        </span>
      </section>

      {submitted ? (
        <section className="card exercise-execution__success" role="status">
          <span className="workspace-empty-state__icon" aria-hidden="true">
            <CheckIcon />
          </span>
          <div>
            <p className="eyebrow">Сесію збережено</p>
            <h2>Виконання записано</h2>
            <p>Лікар побачить цю сесію у вашому прогресі.</p>
            <Link to="/patient/exercises" className="button button--primary">
              Повернутися до призначень <ArrowRightIcon aria-hidden="true" />
            </Link>
          </div>
        </section>
      ) : (
        <form className="card exercise-upload" onSubmit={handleSubmit}>
          <div>
            <p className="eyebrow">Завершення заняття</p>
            <h2>Позначте сесію виконаною</h2>
            <p className="exercise-upload__description">
              Запис зберігається у базі даних. Оцінка болю необов’язкова.
            </p>
          </div>
          <label className="exercise-upload__field">
            <span>Рівень болю після вправи (необов’язково)</span>
            <select
              value={painScore}
              onChange={(event) => setPainScore(event.currentTarget.value)}
            >
              <option value="">Не вказувати</option>
              {Array.from({ length: 11 }, (_, score) => (
                <option key={score} value={score}>
                  {score} із 10
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="button button--primary" disabled={saving}>
            {saving ? 'Зберігаємо…' : 'Завершити сесію'}
            <CheckIcon aria-hidden="true" />
          </button>
        </form>
      )}
    </div>
  )
}
