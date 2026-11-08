import type { HistoryPeriod } from '../../api/history'

const OPTIONS: Array<{ value: HistoryPeriod; label: string }> = [
  { value: '30d', label: '30 днів' },
  { value: '90d', label: '90 днів' },
  { value: 'all', label: 'Увесь час' },
]

interface PeriodSelectorProps {
  value: HistoryPeriod
  onChange: (period: HistoryPeriod) => void
  disabled?: boolean
}

export function PeriodSelector({ value, onChange, disabled = false }: PeriodSelectorProps) {
  return (
    <div className="period-selector" role="group" aria-label="Період">
      {OPTIONS.map((option) => (
        <button
          type="button"
          key={option.value}
          className={
            option.value === value
              ? 'period-selector__option period-selector__option--active'
              : 'period-selector__option'
          }
          aria-pressed={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
