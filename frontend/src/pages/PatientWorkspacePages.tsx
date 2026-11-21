import { EmptyState } from '../components/EmptyState'
import { PageHeading } from '../components/PageHeading'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { PatientAssignment } from '../api/patient'
import { useAuth } from '../auth/useAuth'
import { ErrorMessage } from '../components/ErrorMessage'
import { HelpRequestList } from '../components/HelpRequestList'
import { PatientHistorySection } from '../components/history/PatientHistorySection'
import type { HelpRequest } from '../api/helpRequests'
import { ActivityIcon, ArrowRightIcon, CheckIcon, ClockIcon, UserIcon } from '../components/Icons'
import { AnalysisSummary } from '../components/AnalysisSummary'
import { Loading } from '../components/Loading'
import { SessionVideo } from '../components/SessionVideo'
import { ReferenceVideo } from '../components/ReferenceVideo'
import { usePatientWorkspace } from '../lib/usePatientWorkspace'
import { parseAnalysis } from '../lib/analysis'
import { useVideoAnalysis } from '../lib/useVideoAnalysis'
import { useVideoPreview } from '../lib/useVideoPreview'
import { getDisplayName } from '../lib/profile'
import { formatWeekdays, isAssignmentScheduledToday } from '../lib/assignmentSchedule'

function WorkspaceError() {
  const { error, refresh } = usePatientWorkspace()
  if (!error) return null

  return <ErrorMessage message={error} onRetry={refresh} />
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

function formatSessionDate(value: string | null, fallback: string): string {
  return new Date(value ?? fallback).toLocaleString('uk-UA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function SessionAnalysis({ session }: { session: PatientAssignment['sessions'][number] }) {
  const details = parseAnalysis(session.joint_deviations)

  return (
    <AnalysisSummary
      score={null}
      repetitions={details.repetitions}
      jointScores={details.jointScores}
      errors={details.errors}
    />
  )
}

function SessionDetails({ assignment }: { assignment: PatientAssignment }) {
  if (!assignment.sessions.length) return null

  return (
    <div className="assignment-sessions">
      <h3>Виконані сесії</h3>
      {assignment.sessions
        .slice()
        .sort((left, right) => {
          const leftDate = left.completed_at ?? left.created_at
          const rightDate = right.completed_at ?? right.created_at
          return rightDate.localeCompare(leftDate)
        })
        .map((session, index) => (
          <details className="assignment-session" key={session.id}>
            <summary>
              <span>Сесія {assignment.sessions.length - index}</span>
              <time dateTime={session.completed_at ?? session.created_at}>
                {formatSessionDate(session.completed_at, session.created_at)}
              </time>
            </summary>
            <dl className="assignment-session__details">
              <div>
                <dt>Біль</dt>
                <dd>{session.pain_score === null ? 'Не вказано' : `${session.pain_score} із 10`}</dd>
              </div>
              <div>
                <dt>Оцінка техніки</dt>
                <dd>{session.score === null ? 'Аналіз ще не доступний' : `${session.score} із 10`}</dd>
              </div>
            </dl>
            {session.score !== null && <SessionAnalysis session={session} />}
            {session.has_video && <SessionVideo sessionId={session.id} />}
          </details>
        ))}
    </div>
  )
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

          <PatientHistorySection
            title="Мій прогрес"
            description="Як змінюються біль, регулярність занять та оцінка техніки."
            emptyText="Ви ще не завершили жодної сесії за цей період. Виконайте вправу — і прогрес з’явиться тут."
          />
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
        <EmptyState
          title="У вас ще немає лікарів"
          message="Коли лікар почне з вами працювати, він з’явиться у цьому списку."
          icon={<UserIcon />}
        />
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
        <EmptyState
          title="Поки немає запрошень"
          message="Коли лікар надішле запрошення, воно з’явиться тут."
          icon={<UserIcon />}
        >
          <Link to="/patient/therapists" className="button button--primary">
            Переглянути лікарів <ArrowRightIcon aria-hidden="true" />
          </Link>
        </EmptyState>
      )}
    </div>
  )
}

export function PatientExercisesPage() {
  const { assignments, helpRequests, loading } = usePatientWorkspace()
  const videoPreview = useVideoPreview()
  const [assignmentView, setAssignmentView] = useState<'today' | 'all'>('today')
  const activeAssignments = assignments.filter((assignment) => assignment.status === 'active')
  const completedAssignments = assignments.filter((assignment) => assignment.status === 'completed')
  const todayAssignments = activeAssignments.filter((assignment) =>
    isAssignmentScheduledToday(
      assignment.starts_on,
      assignment.duration_weeks,
      assignment.weekdays,
    ),
  )

  const renderAssignments = (items: typeof assignments) => items.map((assignment) => (
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
            {assignment.status === 'active' ? 'Активне' : 'Завершене'}
          </span>
        </div>
        <p>{assignment.exercise.description ?? 'Опис вправи не додано.'}</p>
        {assignment.exercise.reference_video_key && (
          <ReferenceVideo
            exerciseId={assignment.exercise.id}
            preview={videoPreview}
            showLabel="Переглянути еталонне відео"
          />
        )}
        <div className="exercise-card__meta">
          <span>
            {assignment.repetitions} повторень · {formatWeekdays(assignment.weekdays)}
          </span>
          <span>
            {assignment.sessions.length} сесій · {assignment.duration_weeks} тиж.
          </span>
        </div>
        <SessionDetails assignment={assignment} />
        <ExerciseQuestions
          items={helpRequests.filter((item) => item.assignment_id === assignment.id)}
        />
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
  ))

  return (
    <div className="workspace-page">
      <PageHeading
        eyebrow="План відновлення"
        title="Мої призначення"
        lead="Переглядайте план лікаря та зберігайте кожну виконану сесію."
      />
      <WorkspaceError />
      {videoPreview.error && (
        <ErrorMessage title="Не вдалося відкрити відео" message={videoPreview.error} />
      )}
      {loading ? (
        <Loading label="Завантажуємо призначення…" />
      ) : assignments.length ? (
        <>
          <div className="period-selector" role="tablist" aria-label="Призначення">
            <button
              type="button"
              role="tab"
              aria-selected={assignmentView === 'today'}
              className={assignmentView === 'today' ? 'period-selector__option period-selector__option--active' : 'period-selector__option'}
              onClick={() => setAssignmentView('today')}
            >
              На сьогодні
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={assignmentView === 'all'}
              className={assignmentView === 'all' ? 'period-selector__option period-selector__option--active' : 'period-selector__option'}
              onClick={() => setAssignmentView('all')}
            >
              Усі призначення
            </button>
          </div>
          {assignmentView === 'today' ? (
            todayAssignments.length ? (
              <div className="exercise-list">{renderAssignments(todayAssignments)}</div>
            ) : (
              <EmptyState
                title="На сьогодні вправ немає"
                message="Перевірте розклад або відкрийте всі призначення."
                icon={<ClockIcon />}
              />
            )
          ) : (
            <div className="exercise-assignment-groups">
              {activeAssignments.length > 0 && (
                <section>
                  <div className="card__header">
                    <div><h2>Активні</h2><p>{activeAssignments.length} активних призначень</p></div>
                  </div>
                  <div className="exercise-list">{renderAssignments(activeAssignments)}</div>
                </section>
              )}
              {completedAssignments.length > 0 && (
                <section>
                  <div className="card__header">
                    <div><h2>Завершені</h2><p>{completedAssignments.length} завершених призначень</p></div>
                  </div>
                  <div className="exercise-list">{renderAssignments(completedAssignments)}</div>
                </section>
              )}
            </div>
          )}
        </>
      ) : (
        <EmptyState
          title="Призначень поки немає"
          message="Коли лікар додасть вправу до вашого плану, вона з’явиться тут."
          icon={<ClockIcon />}
        >
          <Link to="/patient/invitations" className="button button--primary">
            Переглянути запрошення <ArrowRightIcon aria-hidden="true" />
          </Link>
        </EmptyState>
      )}
    </div>
  )
}

const ANALYSIS_NOTICES: Record<string, string> = {
  rerecord: 'Обрані частини тіла погано видно на відео. Запишіть відео ще раз так, щоб вас було видно повністю.',
  no_repetitions: 'На відео не вдалося знайти повторень вправи. Запишіть ще раз і виконайте вправу кілька разів.',
  failed: 'Не вдалося проаналізувати відео. Спробуйте ще раз.',
}

export function PatientExerciseExecutionPage() {
  const { assignmentId } = useParams()
  const { assignments, loading, actionPending, completeAssignment, reload } = usePatientWorkspace()
  const [painScore, setPainScore] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [recordingFile, setRecordingFile] = useState<File | null>(null)
  const recordingInputRef = useRef<HTMLInputElement>(null)
  const analysis = useVideoAnalysis(assignmentId, () => void reload())
  const assignment = assignments.find((item) => item.id === assignmentId)
  const saving = actionPending === assignmentId
  const analysing = analysis.phase === 'uploading' || analysis.phase === 'analyzing'
  const painValue = painScore === '' ? null : Number(painScore)
  const saved = analysis.result?.status === 'done' ? analysis.result : null
  const savedSessionId = sessionId ?? saved?.session_id ?? null

  const handleAnalyse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!recordingFile) return
    await analysis.start(recordingFile, painValue)
  }

  const handleCompleteWithoutVideo = async () => {
    if (!assignmentId) return
    const created = await completeAssignment(assignmentId, painValue)
    if (created) setSessionId(created.id)
  }

  const handleTryAgain = () => {
    analysis.reset()
    setRecordingFile(null)
    if (recordingInputRef.current) recordingInputRef.current.value = ''
  }

  if (loading && !analysing && !saved) {
    return (
      <div className="workspace-page">
        <PageHeading title="Виконання вправи" />
        <Loading label="Завантажуємо призначення…" />
      </div>
    )
  }
  if (!assignment) {
    return (
      <div className="workspace-page">
        <PageHeading title="Виконання вправи" />
        <WorkspaceError />
        <EmptyState
          title="Призначення не знайдено"
          message="Можливо, лікар видалив його або воно більше недоступне."
        >
          <Link to="/patient/exercises" className="button button--primary">
            До призначень <ArrowRightIcon aria-hidden="true" />
          </Link>
        </EmptyState>
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
        lead="Завантажте відео виконання: система оцінить техніку й збереже сесію у вашому плані."
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
          {assignment.duration_weeks} тиж. · {formatWeekdays(assignment.weekdays)}
        </span>
      </section>

      {savedSessionId ? (
        <>
          <section className="card exercise-execution__success" role="status">
            <span className="workspace-empty-state__icon" aria-hidden="true">
              <CheckIcon />
            </span>
            <div>
              <p className="eyebrow">Сесію збережено</p>
              <h2>Виконання записано</h2>
              {saved ? (
                <AnalysisSummary
                  score={saved.score}
                  repetitions={saved.repetitions}
                  jointScores={saved.joint_scores}
                  errors={saved.errors}
                />
              ) : (
                <p>Лікар побачить цю сесію у вашому прогресі.</p>
              )}
              <Link to="/patient/exercises" className="button button--primary">
                Повернутися до призначень <ArrowRightIcon aria-hidden="true" />
              </Link>
            </div>
          </section>
          <AskForHelpForm sessionId={savedSessionId} />
        </>
      ) : (
        <form className="card exercise-upload" onSubmit={handleAnalyse}>
          <div>
            <p className="eyebrow">Відео виконання</p>
            <h2>Надішліть відео на аналіз</h2>
            <p className="exercise-upload__description">
              Відео порівнюється з еталоном лікаря. Результат і відео зберігаються у вашому плані.
            </p>
          </div>
          {analysis.error && (
            <ErrorMessage title="Не вдалося виконати аналіз" message={analysis.error} />
          )}
          {analysis.result && analysis.result.status !== 'done' && (
            <ErrorMessage
              title="Результат аналізу"
              message={ANALYSIS_NOTICES[analysis.result.status] ?? ANALYSIS_NOTICES.failed}
            />
          )}
          {analysing && (
            <p className="analysis-progress" role="status">
              {analysis.phase === 'uploading'
                ? 'Завантажуємо відео…'
                : 'Аналізуємо відео. Це може тривати до хвилини…'}
            </p>
          )}
          <label className="exercise-upload__field">
            <span>Відеофайл (MP4 або MOV, максимум 100 МБ)</span>
            <input
              ref={recordingInputRef}
              type="file"
              accept="video/mp4,video/quicktime"
              disabled={analysing}
              onChange={(event) => {
                setRecordingFile(event.target.files?.[0] || null)
                if (analysis.phase !== 'idle') analysis.reset()
              }}
            />
          </label>
          <label className="exercise-upload__field">
            <span>Рівень болю після вправи (необов’язково)</span>
            <select
              value={painScore}
              disabled={analysing}
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
          <div className="exercise-upload__actions">
            {analysis.phase === 'finished' || analysis.phase === 'failed' ? (
              <button type="button" className="button button--primary" onClick={handleTryAgain}>
                Спробувати ще раз
              </button>
            ) : (
              <button
                type="submit"
                className="button button--primary"
                disabled={!recordingFile || analysing}
              >
                {analysing ? 'Аналізуємо…' : 'Надіслати на аналіз'}
              </button>
            )}
            <button
              type="button"
              className={analysis.notConfigured ? 'button button--primary' : 'button button--ghost'}
              onClick={() => void handleCompleteWithoutVideo()}
              disabled={analysing || saving}
            >
              {saving ? 'Зберігаємо…' : 'Завершити без відео'}
              <CheckIcon aria-hidden="true" />
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function AskForHelpForm({ sessionId }: { sessionId: string }) {
  const { actionPending, askForHelp } = usePatientWorkspace()
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const sending = actionPending === sessionId

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (await askForHelp(sessionId, message.trim())) setSent(true)
  }

  if (sent) {
    return (
      <div className="success-message" role="status">
        Запитання надіслано лікарю. Відповідь з’явиться під цією вправою на сторінці «Мій цикл вправ».
      </div>
    )
  }

  return (
    <form className="card exercise-upload" onSubmit={handleSubmit}>
      <div>
        <p className="eyebrow">Потрібна допомога?</p>
        <h2>Запитати лікаря</h2>
        <p className="exercise-upload__description">
          Якщо під час вправи виникли труднощі, біль або питання — напишіть лікарю.
        </p>
      </div>
      <label className="therapist-form__field">
        <span>Ваше запитання</span>
        <textarea
          rows={4}
          maxLength={2000}
          value={message}
          onChange={(event) => setMessage(event.currentTarget.value)}
          required
        />
      </label>
      <button
        type="submit"
        className="button button--primary"
        disabled={sending || !message.trim()}
      >
        {sending ? 'Надсилаємо…' : 'Надіслати запитання'}
      </button>
    </form>
  )
}

/** Collapsible questions to the therapist under one exercise card. */
function ExerciseQuestions({ items }: { items: HelpRequest[] }) {
  if (items.length === 0) return null
  const waiting = items.filter((item) => !item.reply).length

  return (
    <details className="exercise-questions">
      <summary>
        Запитання до лікаря ({items.length})
        {waiting > 0 && <span className="exercise-questions__waiting"> · {waiting} очікує відповіді</span>}
      </summary>
      <HelpRequestList items={items} />
    </details>
  )
}
