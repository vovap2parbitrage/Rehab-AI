import { EmptyState } from '../../components/EmptyState'
import { UserIcon } from '../../components/Icons'
import { Loading } from '../../components/Loading'
import { PageHeading } from '../../components/PageHeading'
import { usePatientData, usePatientWorkspace } from '../../lib/usePatientWorkspace'
import { WorkspaceError } from './WorkspaceError'

function getInitials(email: string): string {
  return email
    .split('@')[0]
    .split(/[._-]/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toLocaleUpperCase('uk-UA')
}

export function PatientTherapistsPage() {
  const { invitations } = usePatientWorkspace()
  const { data: therapists, loading } = usePatientData('therapists')
  const patientInvitations = invitations.data ?? []
  const therapistEmails = new Map(
    patientInvitations.map((invitation) => [invitation.therapist_id, invitation.therapist_email]),
  )
  const connectedTherapists = new Set(
    patientInvitations
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
      <WorkspaceError resource="therapists" />
      {therapists && invitations.error && <WorkspaceError resource="invitations" />}
      {loading ? (
        <Loading label="Завантажуємо список лікарів…" />
      ) : !therapists ? null : therapists.length ? (
        <div className="therapist-grid">
          {therapists.map((therapist) => {
            const email = therapistEmails.get(therapist.id) ?? therapist.id

            return (
              <article className="card therapist-card" key={therapist.id}>
                <div className="therapist-card__top">
                  <span className="avatar avatar--md" aria-hidden="true">
                    {getInitials(email)}
                  </span>
                  <span className="therapist-card__experience">Ваш лікар</span>
                </div>
                <h2>{email}</h2>
                <p className="therapist-card__description">
                  {connectedTherapists.has(therapist.id)
                    ? 'Ви прийняли запрошення цього лікаря.'
                    : 'Лікар прив’язаний до вашого профілю.'}
                </p>
              </article>
            )
          })}
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
