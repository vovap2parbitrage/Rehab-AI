import { useState, type FormEvent } from 'react'
import { usePatientWorkspace } from '../../lib/usePatientWorkspace'

export function AskForHelpForm({ sessionId }: { sessionId: string }) {
  const { actionPending, askForHelp } = usePatientWorkspace()
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const sending = actionPending === sessionId

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (await askForHelp(sessionId, message.trim())) setSent(true)
  }

  if (sent) {
    return (
      <div className="success-message" role="status">
        Запитання надіслано лікарю. Відповідь з’явиться під цією вправою на сторінці «Мій цикл вправ».
      </div>
    )
  }

  return (
    <form className="card exercise-upload" onSubmit={handleSubmit}>
      <div>
        <p className="eyebrow">Потрібна допомога?</p>
        <h2>Запитати лікаря</h2>
        <p className="exercise-upload__description">
          Якщо під час вправи виникли труднощі, біль або питання — напишіть лікарю.
        </p>
      </div>
      <label className="therapist-form__field">
        <span>Ваше запитання</span>
        <textarea
          rows={4}
          maxLength={2000}
          value={message}
          onChange={(event) => setMessage(event.currentTarget.value)}
          required
        />
      </label>
      <button
        type="submit"
        className="button button--primary"
        disabled={sending || !message.trim()}
      >
        {sending ? 'Надсилаємо…' : 'Надіслати запитання'}
      </button>
    </form>
  )
}
