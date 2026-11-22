import { PageHeading } from '../../components/PageHeading'
import { NeedsAttentionSection } from '../../components/NeedsAttentionSection'

export function TherapistQuestionsPage() {
  return (
    <div className="workspace-page">
      <PageHeading
        eyebrow="Кабінет лікаря"
        title="Запитання пацієнтів"
        lead="Запитання, які пацієнти поставили після виконання ваших призначень."
      />
      <NeedsAttentionSection />
    </div>
  )
}
