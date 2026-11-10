import { NeedsAttentionSection } from '../components/NeedsAttentionSection'

export function TherapistQuestionsPage() {
  return (
    <div className="workspace-page">
      <header className="page-heading workspace-heading">
        <div>
          <p className="eyebrow">Кабінет лікаря</p>
          <h1>Запитання пацієнтів</h1>
          <p className="page-heading__lead">
            Запитання, які пацієнти поставили після виконання ваших призначень.
          </p>
        </div>
      </header>
      <NeedsAttentionSection />
    </div>
  )
}
