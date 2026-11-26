import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { PatientHistorySection } from '../../components/history/PatientHistorySection'
import { ActivityIcon, ArrowRightIcon, CheckIcon, UserIcon } from '../../components/Icons'
import { Loading } from '../../components/Loading'
import { PatientMessagesCard } from '../../components/PatientMessagesCard'
import { PageHeading } from '../../components/PageHeading'
import { getDisplayName } from '../../lib/profile'
import { usePatientData } from '../../lib/usePatientWorkspace'
import { WorkspaceError } from './WorkspaceError'

export function PatientDashboardPage() {
  const { user } = useAuth()
  const invitationData = usePatientData('invitations')
  const assignmentData = usePatientData('assignments')
  const invitations = invitationData.data ?? []
  const assignments = assignmentData.data ?? []
  const displayName = getDisplayName(user)
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
      <WorkspaceError resource="invitations" />
      <WorkspaceError resource="assignments" />
      {invitationData.loading || assignmentData.loading ? (
        <Loading label="Завантажуємо ваш кабінет…" />
      ) : (
        invitationData.data &&
        assignmentData.data && (
          <>
            <PatientMessagesCard />
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
                  {pendingInvitation ? 'Переглянути запрошення' : 'Відкрити призначення'}
                  <ArrowRightIcon aria-hidden="true" />
                </Link>
              </div>
              <div className="workspace-welcome__illustration" aria-hidden="true">
                <ActivityIcon />
              </div>
            </section>

            <div className="workspace-summary-grid">
              <section
                className="card workspace-summary-card"
                aria-labelledby="therapist-summary-title"
              >
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

              <section
                className="card workspace-summary-card"
                aria-labelledby="exercise-summary-title"
              >
                <span className="workspace-summary-card__icon workspace-summary-card__icon--teal">
                  <CheckIcon aria-hidden="true" />
                </span>
                <p className="eyebrow">Призначення</p>
                <h2 id="exercise-summary-title">{completedSessions} виконаних сесій</h2>
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
        )
      )}
    </div>
  )
}
