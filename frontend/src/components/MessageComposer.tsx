import { useState, type FormEvent } from 'react'
import { sendMessage } from '../api/messages'
import { getErrorMessage } from '../lib/errorMessage'

interface MessageComposerProps {
  patientId: string
  /** The text the doctor starts from; it can be edited freely. */
  initialText: string
}

/** Therapist: a short form to write to a patient, opened by a "Написати" button. */
export function MessageComposer({ patientId, initialText }: MessageComposerProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(initialText)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await sendMessage(patientId, text.trim())
      setSent(true)
      setOpen(false)
    } catch (reason: unknown) {
      setError(getErrorMessage(reason, 'Не вдалося надіслати повідомлення.'))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <p className="message-composer__sent" role="status">
        Повідомлення надіслано.
      </p>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        className="button button--ghost button--sm"
        onClick={() => setOpen(true)}
      >
        Написати
      </button>
    )
  }

  return (
    <form className="message-composer" onSubmit={handleSubmit}>
      <label className="therapist-form__field">
        <span>Повідомлення пацієнту</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={text}
          onChange={(event) => setText(event.target.value)}
          required
        />
      </label>
      {error && (
        <p className="message-composer__error" role="alert">
          {error}
        </p>
      )}
      <div className="message-composer__actions">
        <button className="button button--primary button--sm" disabled={busy || !text.trim()}>
          {busy ? 'Надсилаємо…' : 'Надіслати'}
        </button>
        <button
          type="button"
          className="button button--ghost button--sm"
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          Скасувати
        </button>
      </div>
    </form>
  )
}
