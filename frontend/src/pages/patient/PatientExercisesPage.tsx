import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { HelpRequest } from '../../api/helpRequests'
import { EmptyState } from '../../components/EmptyState'
import { ErrorMessage } from '../../components/ErrorMessage'
import { HelpRequestList } from '../../components/HelpRequestList'
import { ActivityIcon, ArrowRightIcon, ClockIcon } from '../../components/Icons'
import { Loading } from '../../components/Loading'
import { PageHeading } from '../../components/PageHeading'
import { ReferenceVideo } from '../../components/ReferenceVideo'
import { formatWeekdays, isAssignmentScheduledToday } from '../../lib/assignmentSchedule'
import { usePatientData } from '../../lib/usePatientWorkspace'
import { useVideoPreview } from '../../lib/useVideoPreview'
import { SessionDetails } from './SessionDetails'
import { WorkspaceError } from './WorkspaceError'

export function PatientExercisesPage() {
  const assignmentData = usePatientData('assignments')
  const questionData = usePatientData('helpRequests')
  const assignments = assignmentData.data ?? []
  const helpRequests = questionData.data ?? []
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

  const renderAssignments = (items: typeof assignments) =>
    items.map((assignment) => (
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
      <WorkspaceError resource="assignments" />
      <WorkspaceError resource="helpRequests" />
      {videoPreview.error && (
        <ErrorMessage title="Не вдалося відкрити відео" message={videoPreview.error} />
      )}
      {assignmentData.loading ? (
        <Loading label="Завантажуємо призначення…" />
      ) : !assignmentData.data ? null : assignments.length ? (
        <>
          <div className="period-selector" role="tablist" aria-label="Призначення">
            <button
              type="button"
              role="tab"
              aria-selected={assignmentView === 'today'}
              className={
                assignmentView === 'today'
                  ? 'period-selector__option period-selector__option--active'
                  : 'period-selector__option'
              }
              onClick={() => setAssignmentView('today')}
            >
              На сьогодні
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={assignmentView === 'all'}
              className={
                assignmentView === 'all'
                  ? 'period-selector__option period-selector__option--active'
                  : 'period-selector__option'
              }
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
                    <div>
                      <h2>Активні</h2>
                      <p>{activeAssignments.length} активних призначень</p>
                    </div>
                  </div>
                  <div className="exercise-list">{renderAssignments(activeAssignments)}</div>
                </section>
              )}
              {completedAssignments.length > 0 && (
                <section>
                  <div className="card__header">
                    <div>
                      <h2>Завершені</h2>
                      <p>{completedAssignments.length} завершених призначень</p>
                    </div>
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

/** Collapsible questions to the therapist under one exercise card. */
function ExerciseQuestions({ items }: { items: HelpRequest[] }) {
  if (items.length === 0) return null
  const waiting = items.filter((item) => !item.reply).length

  return (
    <details className="exercise-questions">
      <summary>
        Запитання до лікаря ({items.length})
        {waiting > 0 && (
          <span className="exercise-questions__waiting"> · {waiting} очікує відповіді</span>
        )}
      </summary>
      <HelpRequestList items={items} />
    </details>
  )
}
