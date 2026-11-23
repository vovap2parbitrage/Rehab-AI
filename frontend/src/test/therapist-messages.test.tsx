import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  listSentMessages,
  markReplySeen,
  sendMessage,
  type TherapistMessage,
} from '../api/messages'
import { MessageComposer } from '../components/MessageComposer'
import { SentMessagesSection } from '../components/SentMessagesSection'

vi.mock('../api/messages', () => ({
  listSentMessages: vi.fn(),
  markReplySeen: vi.fn(),
  sendMessage: vi.fn(),
  listMyMessages: vi.fn(),
  replyToMessage: vi.fn(),
}))

const message: TherapistMessage = {
  id: 'm1',
  patient_id: 'p1',
  patient_name: 'Олена Коваль',
  therapist_name: 'Лікар',
  message: 'Чи все гаразд?',
  created_at: '2026-03-01T10:00:00Z',
  reply: null,
  replied_at: null,
  reply_seen: false,
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('Writing to a patient', () => {
  it('starts from a suggested text that the doctor can edit before sending', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValue(message)
    render(<MessageComposer patientId="p1" initialText="Добрий день! Лишилось: Присідання." />)

    await user.click(screen.getByRole('button', { name: 'Написати' }))
    const text = screen.getByLabelText('Повідомлення пацієнту')
    expect(text).toHaveValue('Добрий день! Лишилось: Присідання.')
    await user.type(text, ' Напишіть, що завадило.')
    await user.click(screen.getByRole('button', { name: 'Надіслати' }))

    expect(sendMessage).toHaveBeenCalledWith(
      'p1',
      'Добрий день! Лишилось: Присідання. Напишіть, що завадило.',
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Повідомлення надіслано.')
  })

  it('shows the error and keeps the text when sending fails', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockRejectedValue(new Error('Сервер недоступний'))
    render(<MessageComposer patientId="p1" initialText="Привіт" />)

    await user.click(screen.getByRole('button', { name: 'Написати' }))
    await user.click(screen.getByRole('button', { name: 'Надіслати' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервер недоступний')
    expect(screen.getByLabelText('Повідомлення пацієнту')).toHaveValue('Привіт')
  })

  it('can be cancelled without sending', async () => {
    const user = userEvent.setup()
    render(<MessageComposer patientId="p1" initialText="Привіт" />)

    await user.click(screen.getByRole('button', { name: 'Написати' }))
    await user.click(screen.getByRole('button', { name: 'Скасувати' }))

    expect(screen.getByRole('button', { name: 'Написати' })).toBeInTheDocument()
    expect(sendMessage).not.toHaveBeenCalled()
  })
})

describe('Messages the doctor sent', () => {
  const renderSection = () =>
    render(
      <MemoryRouter>
        <SentMessagesSection />
      </MemoryRouter>,
    )

  it('shows who has not answered yet and the new replies', async () => {
    vi.mocked(listSentMessages).mockResolvedValue([
      { ...message, id: 'm2', reply: 'Хворів', replied_at: '2026-03-01T12:00:00Z' },
      message,
    ])
    renderSection()

    expect(
      await screen.findByRole('heading', {
        name: /Повідомлення пацієнтам \(нових відповідей: 1\)/,
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Нова відповідь')).toBeInTheDocument()
    expect(screen.getByText('Очікує відповіді')).toBeInTheDocument()
    expect(screen.getByText(/Відповідь пацієнта:/)).toBeInTheDocument()
  })

  it('marks a reply as read', async () => {
    const user = userEvent.setup()
    vi.mocked(markReplySeen).mockResolvedValue(undefined)
    vi.mocked(listSentMessages).mockResolvedValue([{ ...message, reply: 'Хворів' }])
    renderSection()

    await user.click(await screen.findByRole('button', { name: 'Прочитано' }))

    expect(markReplySeen).toHaveBeenCalledWith('m1')
    expect(await screen.findByText('Відповідь прочитано')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Прочитано' })).not.toBeInTheDocument()
  })

  it('says so when the doctor has not written to anyone', async () => {
    vi.mocked(listSentMessages).mockResolvedValue([])
    renderSection()

    expect(await screen.findByText('Ви ще нікому не писали.')).toBeInTheDocument()
  })
})
