interface ListSearchProps {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}

export function ListSearch({ label, value, placeholder, onChange }: ListSearchProps) {
  return (
    <label className="therapist-form__field list-search">
      <span>{label}</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  )
}

interface ListPaginationProps {
  total: number
  limit: number
  offset: number
  onChange: (offset: number) => void
}

export function ListPagination({ total, limit, offset, onChange }: ListPaginationProps) {
  if (total <= limit) return null

  const first = offset + 1
  const last = Math.min(offset + limit, total)

  return (
    <nav className="list-pagination" aria-label="Сторінки списку">
      <button
        type="button"
        className="button button--ghost"
        onClick={() => onChange(Math.max(0, offset - limit))}
        disabled={offset === 0}
      >
        Попередня
      </button>
      <span aria-live="polite">
        {first}–{last} з {total}
      </span>
      <button
        type="button"
        className="button button--ghost"
        onClick={() => onChange(offset + limit)}
        disabled={last >= total}
      >
        Наступна
      </button>
    </nav>
  )
}
