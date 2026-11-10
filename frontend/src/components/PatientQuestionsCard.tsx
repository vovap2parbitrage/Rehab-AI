import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client'
import { listPatientHelpRequests, type HelpRequest } from '../api/helpRequests'
import { HelpRequestList } from './HelpRequestList'
import { MailIcon } from './Icons'
import { Loading } from './Loading'

const PREVIEW_COUNT = 1

/** Therapist: the patient's latest questions; the full history opens in a dialog. */
export function PatientQuestionsCard({ patientId }: { patientId: string }) {
  const [items, setItems] = useState<HelpRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const waiting = items.filter((item) => !item.reply).length

  useEffect(() => {
    const controller = new AbortController()
    listPatientHelpRequests(patientId, controller.signal)
      .then(setItems)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(
          reason instanceof ApiError
            ? reason.detail || reason.message
            : 'Не вдалося завантажити запитання пацієнта.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [patientId])

  return (
    <section className="card patient-questions" aria-labelledby="patient-questions-title">
      <div className="card__header">
        <div>
          <h2 id="patient-questions-title">Запитання пацієнта ({items.length})</h2>
          <p>Останнє запитання після виконання ваших призначень.</p>
        </div>
        <span className="card__header-icon"><MailIcon /></span>
      </div>
      {error && <p className="exercise-upload__error">{error}</p>}
      {loading ? (
        <Loading label="Завантажуємо запитання…" />
      ) : items.length === 0 ? (
        <p className="therapist-list__empty">Пацієнт ще не ставив запитань.</p>
      ) : (
        <>
          <HelpRequestList items={items.slice(0, PREVIEW_COUNT)} showExercise compact />
          <div className="patient-questions__actions">
            <button
              type="button"
              className="button button--ghost"
              onClick={() => dialogRef.current?.showModal()}
            >
              Усі запитання ({items.length})
            </button>
            {waiting > 0 && (
              <Link to="/therapist/questions" className="button button--primary">
                Відповісти ({waiting})
              </Link>
            )}
          </div>
        </>
      )}

      <dialog
        ref={dialogRef}
        className="questions-dialog"
        aria-labelledby="questions-dialog-title"
        onClick={(event) => {
          // A click on the backdrop (the dialog element itself) closes it.
          if (event.target === event.currentTarget) event.currentTarget.close()
        }}
      >
        <div className="questions-dialog__header">
          <h2 id="questions-dialog-title">Усі запитання пацієнта</h2>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => dialogRef.current?.close()}
          >
            Закрити
          </button>
        </div>
        <HelpRequestList items={items} showExercise />
      </dialog>
    </section>
  )
}
