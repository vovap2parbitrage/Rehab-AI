import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ActivityIcon, ArrowRightIcon, CheckIcon, ClockIcon, UserIcon } from '../components/Icons'
import { DOCTORS, EXERCISES, usePatientWorkspace } from '../lib/patientWorkspace'
import { getDisplayName } from '../lib/profile'

function PageHeading({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return (
    <header className="page-heading workspace-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-heading__lead">{lead}</p>
      </div>
    </header>
  )
}

export function PatientDashboardPage() {
  const { tokenParsed } = useAuth()
  const { state } = usePatientWorkspace()
  const displayName = getDisplayName(tokenParsed)
  const invitedDoctor = DOCTORS.find((doctor) => doctor.id === state.invitationDoctorId)
  const selectedDoctor = state.invitationStatus === 'accepted' ? invitedDoctor : undefined
  const completedCount = selectedDoctor ? state.completedExerciseIds.length : 0
  const progress = Math.round((completedCount / EXERCISES.length) * 100)

  return (
    <div className="workspace-page">
      <PageHeading
        eyebrow="Кабінет пацієнта"
        title={`Вітаємо, ${displayName}`}
        lead="Ваше відновлення, фахівець і щоденний цикл вправ — в одному місці."
      />

      <section className="workspace-welcome card" aria-labelledby="welcome-title">
        <div className="workspace-welcome__copy">
          <p className="eyebrow">Ваш наступний крок</p>
          <h2 id="welcome-title">
            {state.invitationStatus === 'pending'
              ? 'Вам надійшло запрошення'
              : selectedDoctor
                ? 'Ваш терапевт уже з вами'
                : 'Очікуйте запрошення від терапевта'}
          </h2>
          <p>
            {state.invitationStatus === 'pending' && invitedDoctor
              ? `${invitedDoctor.name} надіслала вам запрошення до співпраці. Перегляньте його та прийміть або відхиліть.`
              : selectedDoctor
                ? 'Ви прийняли запрошення. Перейдіть до свого циклу та відстежуйте виконання вправ.'
                : 'Коли терапевт надішле запрошення, воно з’явиться у цьому кабінеті.'}
          </p>
          <Link
            className="button button--primary"
            to={state.invitationStatus === 'pending' ? '/patient/invitations' : '/patient/doctors'}
          >
            {state.invitationStatus === 'pending'
              ? 'Переглянути запрошення'
              : selectedDoctor
                ? 'Відкрити цикл вправ'
                : 'Переглянути лікарів'}
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        </div>
        <div className="workspace-welcome__illustration" aria-hidden="true">
          <ActivityIcon />
        </div>
      </section>

      <div className="workspace-summary-grid">
        <section className="card workspace-summary-card" aria-labelledby="doctor-summary-title">
          <span className="workspace-summary-card__icon">
            <UserIcon aria-hidden="true" />
          </span>
          <p className="eyebrow">
            {selectedDoctor ? 'Мій терапевт' : 'Запрошення від'}
          </p>
          <h2 id="doctor-summary-title">
            {selectedDoctor?.name ?? invitedDoctor?.name ?? 'Поки не призначений'}
          </h2>
          <p>
            {selectedDoctor?.specialty ??
              (invitedDoctor ? `Запрошення: ${invitedDoctor.specialty}` : 'Очікуйте запрошення')}
          </p>
          <Link to="/patient/invitations" className="text-link">
            {state.invitationStatus === 'pending'
              ? 'Переглянути запрошення'
              : selectedDoctor
                ? 'Статус терапевта'
                : 'Переглянути запрошення'}
          </Link>
        </section>

        <section className="card workspace-summary-card" aria-labelledby="exercise-summary-title">
          <span className="workspace-summary-card__icon workspace-summary-card__icon--teal">
            <CheckIcon aria-hidden="true" />
          </span>
          <p className="eyebrow">Цикл вправ</p>
          <h2 id="exercise-summary-title">
            {selectedDoctor ? `${completedCount} із ${EXERCISES.length} виконано` : 'Ще не призначений'}
          </h2>
          {selectedDoctor ? (
            <div
              className="workspace-progress"
              role="progressbar"
              aria-label="Прогрес циклу вправ"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
          ) : (
            <p>Прийміть запрошення терапевта, щоб перейти до циклу.</p>
          )}
          <Link to="/patient/exercises" className="text-link">
            Відкрити цикл
          </Link>
        </section>
      </div>

    </div>
  )
}

export function PatientDoctorsPage() {
  return (
    <div className="workspace-page">
      <PageHeading
        eyebrow="Фахівці"
        title="Список лікарів"
        lead="Переглядайте профілі фахівців, які можуть надіслати вам запрошення до співпраці."
      />

      <div className="info-note workspace-note">
        Запрошення надсилає лікар. Ви зможете прийняти або відхилити його в розділі «Запрошення».
      </div>

      <div className="doctor-grid">
        {DOCTORS.map((doctor) => (
          <article className="card doctor-card" key={doctor.id}>
            <div className="doctor-card__top">
              <span className="avatar avatar--md" aria-hidden="true">
                {doctor.initials}
              </span>
              <span className="doctor-card__experience">{doctor.experience}</span>
            </div>
            <h2>{doctor.name}</h2>
            <p className="doctor-card__specialty">{doctor.specialty}</p>
            <p className="doctor-card__description">{doctor.description}</p>
            <span className="doctor-card__directory-label">Профіль фахівця</span>
          </article>
        ))}
      </div>
      <p className="workspace-demo-caption">
        Демо-список фахівців. Запрошення та список потребують інтеграції з backend.
      </p>
    </div>
  )
}

export function PatientInvitationsPage() {
  const { state, acceptInvitation, declineInvitation } = usePatientWorkspace()
  const invitedDoctor = DOCTORS.find((doctor) => doctor.id === state.invitationDoctorId)
  const isPending = state.invitationStatus === 'pending'
  const isAccepted = state.invitationStatus === 'accepted'

  return (
    <div className="workspace-page">
      <PageHeading
        eyebrow="Зв’язок із фахівцем"
        title="Запрошення від лікарів"
        lead="Перегляньте запрошення від терапевта та вирішіть, чи хочете почати співпрацю."
      />

      {invitedDoctor && state.invitationStatus ? (
        <section className="card invitation-card" aria-labelledby="invitation-title">
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
              {isPending ? 'Нове запрошення' : isAccepted ? 'Запрошення прийнято' : 'Запрошення відхилено'}
            </span>
            <h2 id="invitation-title">
              {invitedDoctor.name} запрошує вас до співпраці
            </h2>
            <p>
              {isPending
                ? 'Прийміть запрошення, щоб почати працювати з терапевтом і переглянути призначений цикл вправ.'
                : isAccepted
                  ? 'Ви прийняли запрошення та можете перейти до циклу вправ.'
                  : 'Ви відхилили це запрошення. Якщо передумаєте, попросіть лікаря надіслати нове.'}
            </p>
            <p className="invitation-card__specialty">{invitedDoctor.specialty}</p>
            <div className="invitation-card__actions">
              {isPending ? (
                <>
                  <button type="button" className="button button--primary" onClick={acceptInvitation}>
                    <CheckIcon aria-hidden="true" /> Прийняти запрошення
                  </button>
                  <button type="button" className="button button--ghost" onClick={declineInvitation}>
                    Відхилити
                  </button>
                </>
              ) : isAccepted ? (
                <Link to="/patient/exercises" className="button button--primary">
                  Перейти до циклу вправ <ArrowRightIcon aria-hidden="true" />
                </Link>
              ) : (
                <Link to="/patient/doctors" className="button button--ghost">
                  Переглянути список лікарів <ArrowRightIcon aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="card workspace-empty-state">
          <span className="workspace-empty-state__icon" aria-hidden="true">
            <UserIcon />
          </span>
          <h2>Поки немає запрошень</h2>
          <p>Коли лікар надішле запрошення, воно з’явиться тут.</p>
          <Link to="/patient/doctors" className="button button--primary">
            Переглянути лікарів <ArrowRightIcon aria-hidden="true" />
          </Link>
        </section>
      )}
    </div>
  )
}

export function PatientExercisesPage() {
  const { state } = usePatientWorkspace()
  const selectedDoctor =
    state.invitationStatus === 'accepted'
      ? DOCTORS.find((doctor) => doctor.id === state.invitationDoctorId)
      : undefined
  const completedCount = state.completedExerciseIds.length
  const progress = Math.round((completedCount / EXERCISES.length) * 100)

  return (
    <div className="workspace-page">
      <PageHeading
        eyebrow="План відновлення"
        title="Мій цикл вправ"
        lead="Відкрийте вправу, завантажте відео виконання та завершіть сесію."
      />

      {!selectedDoctor ? (
        <section className="card workspace-empty-state">
          <span className="workspace-empty-state__icon" aria-hidden="true">
            <ClockIcon />
          </span>
          <h2>Цикл вправ ще не доступний</h2>
          <p>
            {state.invitationStatus === 'declined'
              ? 'Попросіть лікаря надіслати нове запрошення. Після його прийняття у кабінеті з’являться призначені вправи.'
              : 'Спочатку прийміть запрошення від лікаря. Після цього у кабінеті з’являться призначені вправи.'}
          </p>
          <Link to="/patient/invitations" className="button button--primary">
            Переглянути запрошення <ArrowRightIcon aria-hidden="true" />
          </Link>
        </section>
      ) : (
        <>
          <section className="card exercise-cycle-summary" aria-labelledby="cycle-summary-title">
            <div>
              <p className="eyebrow">Демо-цикл · тиждень 1</p>
              <h2 id="cycle-summary-title">План від {selectedDoctor.name}</h2>
              <p>
                Це демонстраційний план; персональні призначення надійдуть від вашого терапевта.
              </p>
            </div>
            <div className="exercise-cycle-summary__progress">
              <strong>{progress}%</strong>
              <span>
                {completedCount}/{EXERCISES.length} виконано
              </span>
            </div>
          </section>

          <div className="exercise-list">
            {EXERCISES.map((exercise) => {
              const completed = state.completedExerciseIds.includes(exercise.id)
              return (
                <article
                  className={
                    completed ? 'card exercise-card exercise-card--complete' : 'card exercise-card'
                  }
                  key={exercise.id}
                >
                  <span className="exercise-card__icon" aria-hidden="true">
                    <ActivityIcon />
                  </span>
                  <div className="exercise-card__content">
                    <div className="exercise-card__title-row">
                      <h2>{exercise.title}</h2>
                      {completed && (
                        <span className="status-pill status-pill--success status-pill--sm">
                          <CheckIcon aria-hidden="true" /> Виконано
                        </span>
                      )}
                    </div>
                    <p>{exercise.description}</p>
                    <div className="exercise-card__meta">
                      <span>{exercise.prescription}</span>
                      <span>{exercise.duration}</span>
                    </div>
                  </div>
                  <Link
                    to={`/patient/exercises/${exercise.id}/execute`}
                    className={
                      completed
                        ? 'button button--ghost exercise-card__action'
                        : 'button button--primary exercise-card__action'
                    }
                  >
                    {completed ? 'Повторити вправу' : 'Виконати вправу'}
                    <ArrowRightIcon aria-hidden="true" />
                  </Link>
                </article>
              )
            })}
          </div>
          <p className="workspace-demo-caption">
            Приклад вправ для демонстрації інтерфейсу, не медична рекомендація. Виконуйте лише
            вправи, погоджені з вашим фахівцем.
          </p>
        </>
      )}
    </div>
  )
}

export function PatientExerciseExecutionPage() {
  const { exerciseId } = useParams()
  const { state, completeExercise } = usePatientWorkspace()
  const [selectedVideo, setSelectedVideo] = useState<{ file: File; url: string } | null>(null)
  const [fileError, setFileError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const exercise = EXERCISES.find((item) => item.id === exerciseId)
  const isPatientReady = state.invitationStatus === 'accepted'

  useEffect(() => {
    if (!selectedVideo) return
    return () => URL.revokeObjectURL(selectedVideo.url)
  }, [selectedVideo])

  if (!exercise || !isPatientReady) {
    return <Navigate to="/patient/exercises" replace />
  }

  const handleVideoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedVideo = event.currentTarget.files?.[0] ?? null
    event.currentTarget.value = ''

    if (!selectedVideo) return

    if (!selectedVideo.type.startsWith('video/')) {
      setSelectedVideo(null)
      setFileError('Оберіть відеофайл, наприклад MP4, MOV або WebM.')
      setSubmitted(false)
      return
    }

    setSelectedVideo({
      file: selectedVideo,
      url: URL.createObjectURL(selectedVideo),
    })
    setFileError('')
    setSubmitted(false)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedVideo) {
      setFileError('Спочатку оберіть відео виконання.')
      return
    }

    completeExercise(exercise.id)
    setSubmitted(true)
  }

  const formattedVideoSize = selectedVideo
    ? `${(selectedVideo.file.size / (1024 * 1024)).toLocaleString('uk-UA', {
        maximumFractionDigits: 1,
      })} МБ`
    : ''

  return (
    <div className="workspace-page">
      <Link to="/patient/exercises" className="text-link exercise-execution__back">
        ← Повернутися до циклу вправ
      </Link>

      <PageHeading
        eyebrow="Виконання вправи"
        title={exercise.title}
        lead="Виконайте вправу за рекомендацією фахівця, додайте відео та завершіть сесію."
      />

      <section className="card exercise-execution__details" aria-labelledby="execution-instructions">
        <div>
          <p className="eyebrow">Інструкція</p>
          <h2 id="execution-instructions">{exercise.prescription}</h2>
          <p>{exercise.description}</p>
        </div>
        <span className="exercise-execution__duration">
          <ClockIcon aria-hidden="true" />
          {exercise.duration}
        </span>
      </section>

      {submitted ? (
        <section className="card exercise-execution__success" role="status">
          <span className="workspace-empty-state__icon" aria-hidden="true">
            <CheckIcon />
          </span>
          <div>
            <p className="eyebrow">Сесію завершено</p>
            <h2>Вправу позначено виконаною</h2>
            <p>
              Відео «{selectedVideo?.file.name}» вибране для цієї демо-сесії. Воно не надсилалося на
              сервер і залишилося на вашому пристрої.
            </p>
            <Link to="/patient/exercises" className="button button--primary">
              Повернутися до циклу <ArrowRightIcon aria-hidden="true" />
            </Link>
          </div>
        </section>
      ) : (
        <form className="card exercise-upload" onSubmit={handleSubmit}>
          <div>
            <p className="eyebrow">Крок 1 · Відео</p>
            <h2>Додайте відео виконання</h2>
            <p className="exercise-upload__description">
              Оберіть запис із пристрою, щоб переглянути його перед завершенням вправи.
            </p>
          </div>

          <label className="exercise-upload__field">
            <span>Відеофайл</span>
            <input type="file" accept="video/*" onChange={handleVideoChange} />
          </label>

          {fileError && (
            <p className="exercise-upload__error" role="alert">
              {fileError}
            </p>
          )}

          {selectedVideo && (
            <div className="exercise-upload__preview">
              <video src={selectedVideo.url} controls preload="metadata">
                Ваш браузер не підтримує відтворення відео.
              </video>
              <p>
                {selectedVideo.file.name} · {formattedVideoSize}
              </p>
            </div>
          )}

          <p className="exercise-upload__notice" role="note">
            Демо-режим: відео лише відкривається у браузері для попереднього перегляду. Воно не
            завантажується на сервер і не передається на аналіз.
          </p>

          <button type="submit" className="button button--primary" disabled={!selectedVideo}>
            Завершити виконання <CheckIcon aria-hidden="true" />
          </button>
        </form>
      )}
    </div>
  )
}
