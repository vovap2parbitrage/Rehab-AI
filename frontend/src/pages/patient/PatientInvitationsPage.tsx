import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ArrowRightIcon, CheckIcon, ClockIcon, UserIcon } from '../../components/Icons'
import { Loading } from '../../components/Loading'
import { PageHeading } from '../../components/PageHeading'
import { usePatientData, usePatientWorkspace } from '../../lib/usePatientWorkspace'
import { WorkspaceError } from './WorkspaceError'

export function PatientInvitationsPage() {
  const { actionPending, respondToInvitation } = usePatientWorkspace()
  const { data: invitations, loading } = usePatientData('invitations')

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
      <WorkspaceError resource="invitations" />
      {loading ? (
        <Loading label="Завантажуємо запрошення…" />
      ) : !invitations ? null : invitations.length ? (
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
