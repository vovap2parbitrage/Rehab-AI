import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnalysisSummary } from '../../components/AnalysisSummary'
import { EmptyState } from '../../components/EmptyState'
import { ErrorMessage } from '../../components/ErrorMessage'
import { ArrowRightIcon, CheckIcon, ClockIcon } from '../../components/Icons'
import { Loading } from '../../components/Loading'
import { PageHeading } from '../../components/PageHeading'
import { analysisNotice } from '../../lib/analysisNotice'
import { formatDay, formatWeekdays } from '../../lib/assignmentSchedule'
import { usePatientData, usePatientWorkspace } from '../../lib/usePatientWorkspace'
import { useVideoAnalysis } from '../../lib/useVideoAnalysis'
import { useVideoRecorder } from '../../lib/useVideoRecorder'
import { AskForHelpForm } from './AskForHelpForm'
import { VideoRecorder } from './VideoRecorder'
import { WorkspaceError } from './WorkspaceError'

type VideoSource = 'record' | 'upload'

export function PatientExerciseExecutionPage() {
  const { assignmentId } = useParams()
  const { actionPending, completeAssignment } = usePatientWorkspace()
  const { data: assignments, loading, load: loadAssignments } = usePatientData('assignments')
  const [painScore, setPainScore] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const recorder = useVideoRecorder()
  const [source, setSource] = useState<VideoSource>(() =>
    recorder.supported ? 'record' : 'upload',
  )
  const analysis = useVideoAnalysis(
    assignmentId,
    () => void loadAssignments({ refresh: true, background: true }),
  )
  const assignment = assignments?.find((item) => item.id === assignmentId)
  const saving = actionPending === assignmentId
  const analysing = analysis.phase === 'uploading' || analysis.phase === 'analyzing'
  // The countdown counts too: the patient is already stepping back to record.
  const recording = recorder.status === 'recording' || recorder.status === 'countdown'
  const videoFile = source === 'record' ? recorder.file : uploadedFile
  const painValue = painScore === '' ? null : Number(painScore)
  const saved = analysis.result?.status === 'done' ? analysis.result : null
  const savedSessionId = sessionId ?? saved?.session_id ?? null
  const notice = analysis.result ? analysisNotice(analysis.result) : null
  const problem = analysis.error ?? notice?.message ?? null
  const problemRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (problem) problemRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }, [problem])

  const handleAnalyse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!videoFile) return
    await analysis.start(videoFile, painValue)
  }

  const handleCompleteWithoutVideo = async () => {
    if (!assignmentId) return
    const created = await completeAssignment(assignmentId, painValue)
    if (created) setSessionId(created.id)
  }

  const clearUploadedFile = () => {
    setUploadedFile(null)
    if (uploadInputRef.current) uploadInputRef.current.value = ''
  }

  const handleTryAgain = () => {
    analysis.reset()
    clearUploadedFile()
    recorder.discard()
  }

  const resetFinishedAnalysis = () => {
    if (analysis.phase !== 'idle') analysis.reset()
  }

  const changeSource = (next: VideoSource) => {
    if (next === source) return
    recorder.discard()
    clearUploadedFile()
    resetFinishedAnalysis()
    setSource(next)
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

  // A session can only be done on a day it is due, once that day. A result that was just
  // saved stays on screen even though the assignment now counts as done today.
  const canStartToday =
    assignment.status === 'active' && assignment.scheduled_today && !assignment.done_today
  if (!canStartToday && !savedSessionId && !analysing) {
    return (
      <div className="workspace-page">
        <PageHeading title={assignment.exercise.name} />
        <EmptyState
          title={
            assignment.done_today
              ? 'Сьогодні цю вправу вже виконано'
              : 'Сьогодні цю вправу виконувати не потрібно'
          }
          message={
            assignment.done_today || !assignment.next_session_on
              ? 'Виконати вправу можна один раз у день заняття.'
              : `Наступне заняття: ${formatDay(assignment.next_session_on)}. Виконати вправу можна лише в день заняття.`
          }
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
        lead="Запишіть або завантажте відео виконання: система оцінить техніку й збереже сесію у вашому плані."
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
          {recorder.supported ? (
            <div className="video-source" role="group" aria-label="Спосіб надіслати відео">
              {(
                [
                  ['record', 'Записати камерою'],
                  ['upload', 'Завантажити файл'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="video-source__option"
                  aria-pressed={source === value}
                  disabled={analysing || recording}
                  onClick={() => changeSource(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <p className="exercise-upload__notice">
              {typeof window !== 'undefined' && window.isSecureContext === false
                ? 'Запис камерою доступний лише через захищене з’єднання (HTTPS). Завантажте готовий файл.'
                : 'Цей браузер не підтримує запис у застосунку. Завантажте готовий файл.'}
            </p>
          )}
          {analysing && (
            <p className="analysis-progress" role="status">
              {analysis.phase === 'uploading'
                ? 'Завантажуємо відео…'
                : 'Аналізуємо відео. Це може тривати до хвилини…'}
            </p>
          )}
          {source === 'record' ? (
            <VideoRecorder
              recorder={recorder}
              disabled={analysing}
              onDiscard={resetFinishedAnalysis}
              onUseFileInstead={() => changeSource('upload')}
            />
          ) : (
            <label className="exercise-upload__field">
              <span>Відеофайл (MP4 або MOV, максимум 100 МБ)</span>
              <input
                ref={uploadInputRef}
                type="file"
                accept="video/mp4,video/quicktime"
                disabled={analysing}
                onChange={(event) => {
                  setUploadedFile(event.target.files?.[0] || null)
                  resetFinishedAnalysis()
                }}
              />
            </label>
          )}
          {/* Next to the video, where the patient is looking, rather than at the top of the form. */}
          <div ref={problemRef} className="exercise-upload__problem">
            {analysis.error && <ErrorMessage title="Відео не надіслано" message={analysis.error} />}
            {notice && <ErrorMessage title={notice.title} message={notice.message} />}
          </div>
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
                disabled={!videoFile || analysing || recording}
              >
                {analysing ? 'Аналізуємо…' : 'Надіслати на аналіз'}
              </button>
            )}
            <button
              type="button"
              className={analysis.notConfigured ? 'button button--primary' : 'button button--ghost'}
              onClick={() => void handleCompleteWithoutVideo()}
              disabled={analysing || saving || recording}
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
