import type { PatientAssignment } from '../../api/patient'
import { SessionResult } from '../../components/SessionResult'

export function SessionDetails({ assignment }: { assignment: PatientAssignment }) {
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
          <SessionResult
            key={session.id}
            session={session}
            title={`Сесія ${assignment.sessions.length - index}`}
          />
        ))}
    </div>
  )
}
