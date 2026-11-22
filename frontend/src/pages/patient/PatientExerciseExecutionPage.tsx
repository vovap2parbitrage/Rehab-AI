import { useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnalysisSummary } from '../../components/AnalysisSummary'
import { EmptyState } from '../../components/EmptyState'
import { ErrorMessage } from '../../components/ErrorMessage'
import { ArrowRightIcon, CheckIcon, ClockIcon } from '../../components/Icons'
import { Loading } from '../../components/Loading'
import { PageHeading } from '../../components/PageHeading'
import { formatWeekdays } from '../../lib/assignmentSchedule'
import { usePatientData, usePatientWorkspace } from '../../lib/usePatientWorkspace'
import { useVideoAnalysis } from '../../lib/useVideoAnalysis'
import { AskForHelpForm } from './AskForHelpForm'
import { WorkspaceError } from './WorkspaceError'

const ANALYSIS_NOTICES: Record<string, string> = {
  rerecord:
    'Обрані частини тіла погано видно на відео. Запишіть відео ще раз так, щоб вас було видно повністю.',
  no_repetitions:
    'На відео не вдалося знайти повторень вправи. Запишіть ще раз і виконайте вправу кілька разів.',
  failed: 'Не вдалося проаналізувати відео. Спробуйте ще раз.',
}

export function PatientExerciseExecutionPage() {
  const { assignmentId } = useParams()
  const { actionPending, completeAssignment } = usePatientWorkspace()
  const { data: assignments, loading, load: loadAssignments } = usePatientData('assignments')
  const [painScore, setPainScore] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [recordingFile, setRecordingFile] = useState<File | null>(null)
  const recordingInputRef = useRef<HTMLInputElement>(null)
  const analysis = useVideoAnalysis(
    assignmentId,
    () => void loadAssignments({ refresh: true, background: true }),
  )
  const assignment = assignments?.find((item) => item.id === assignmentId)
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
        <WorkspaceError resource="assignments" />
        {assignments && (
          <EmptyState
            title="Призначення не знайдено"
            message="Можливо, лікар видалив його або воно більше недоступне."
          >
            <Link to="/patient/exercises" className="button button--primary">
              До призначень <ArrowRightIcon aria-hidden="true" />
            </Link>
          </EmptyState>
        )}
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
      <WorkspaceError resource="assignments" />

      <section
        className="card exercise-execution__details"
        aria-labelledby="execution-instructions"
      >
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
