import type { ReactNode } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import type { TodayPatient } from '../../api/therapist'
import { EmptyState } from '../../components/EmptyState'
import { ErrorMessage } from '../../components/ErrorMessage'
import { Loading } from '../../components/Loading'
import { PageHeading } from '../../components/PageHeading'
import { useRefreshOnEntry } from '../../lib/useCachedResource'
import type { TherapistWorkspaceResources } from './TherapistWorkspaceLayout'

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
}

function PatientRow({ patient, children }: { patient: TodayPatient; children?: ReactNode }) {
  return (
    <li className="today-row">
      <Link to={`/therapist/patients/${patient.patient_id}`}>
        <strong>{patient.patient_name}</strong>
      </Link>
      {children}
    </li>
  )
}

/** Who has done what is due today, who has not, and who missed yesterday. */
export function TherapistTodayPage() {
  const { today: resource } = useOutletContext<TherapistWorkspaceResources>()
  useRefreshOnEntry(resource)
  const { data, loading, error } = resource

  const date = data
    ? new Date(`${data.date}T00:00:00`).toLocaleDateString('uk-UA', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : ''

  return (
    <div className="workspace-page">
      <PageHeading
        eyebrow="Кабінет лікаря"
        title="Сьогодні"
        lead={data ? `${date}. Час за київським поясом.` : 'Хто виконав заняття, а хто ні.'}
      />
      {error && (
        <ErrorMessage message={error} onRetry={() => void resource.load({ refresh: true })} />
      )}
      {loading && !data && <Loading label="Завантажуємо сьогоднішній день…" />}
      {data && (
        <>
          <section className="today-counters" aria-label="Підсумок дня">
            <div className="card today-counter">
              <strong>{data.counters.due_today}</strong>
              <span>пацієнтів із заняттям сьогодні</span>
            </div>
            <div className="card today-counter">
              <strong>{data.counters.finished}</strong>
              <span>виконали все</span>
            </div>
            <div className="card today-counter">
              <strong>{data.counters.not_finished}</strong>
              <span>ще не виконали</span>
            </div>
            <div className="card today-counter">
              <strong>{data.counters.missed_yesterday}</strong>
              <span>пропустили вчора</span>
            </div>
            <Link to="/therapist/questions" className="card today-counter">
              <strong>{data.counters.open_questions}</strong>
              <span>запитань чекають відповіді</span>
            </Link>
          </section>

          {data.counters.due_today === 0 && data.counters.missed_yesterday === 0 && (
            <EmptyState message="На сьогодні занять немає, і вчора ніхто нічого не пропустив." />
          )}

          <div className="workspace-summary-grid therapist-page__grid">
            <section className="card">
              <div className="card__header">
                <div>
                  <h2>Ще не виконали ({data.not_finished.length})</h2>
                  <p>Заняття на сьогодні, де щось лишилось.</p>
                </div>
              </div>
              {data.not_finished.length === 0 ? (
                <EmptyState message="Усі, кому сьогодні треба, вже виконали." />
              ) : (
                <ul className="today-list">
                  {data.not_finished.map((patient) => {
                    const left = patient.items.filter((item) => !item.done)
                    return (
                      <PatientRow patient={patient} key={patient.patient_id}>
                        <small>
                          Виконано {patient.items.length - left.length} з {patient.items.length}.
                          Лишилось: {left.map((item) => item.exercise_name).join(', ')}
                        </small>
                      </PatientRow>
                    )
                  })}
                </ul>
              )}
            </section>

            <section className="card">
              <div className="card__header">
                <div>
                  <h2>Виконали все ({data.finished.length})</h2>
                  <p>Усе, що було заплановано на сьогодні.</p>
                </div>
              </div>
              {data.finished.length === 0 ? (
                <EmptyState message="Поки ніхто не виконав усе." />
              ) : (
                <ul className="today-list">
                  {data.finished.map((patient) => (
                    <PatientRow patient={patient} key={patient.patient_id}>
                      <small>
                        {patient.items.map((item) => item.exercise_name).join(', ')}
                        {patient.last_completed_at &&
                          ` · останнє о ${formatTime(patient.last_completed_at)}`}
                      </small>
                    </PatientRow>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="card">
            <div className="card__header">
              <div>
                <h2>Пропустили вчора ({data.missed_yesterday.length})</h2>
                <p>Заняття, які були заплановані на вчора й не виконані.</p>
              </div>
            </div>
            {data.missed_yesterday.length === 0 ? (
              <EmptyState message="Вчора нічого не пропущено." />
            ) : (
              <ul className="today-list">
                {data.missed_yesterday.map((patient) => (
                  <PatientRow patient={patient} key={patient.patient_id}>
                    <small>
                      Не виконано: {patient.items.map((item) => item.exercise_name).join(', ')}
                    </small>
                  </PatientRow>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
