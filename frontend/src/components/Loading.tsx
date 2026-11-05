interface LoadingProps {
  label?: string
  fullPage?: boolean
}

export function Loading({ label = 'Завантаження…', fullPage = false }: LoadingProps) {
  return (
    <div
      className={fullPage ? 'loading loading--page' : 'loading'}
      role="status"
      aria-live="polite"
    >
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
