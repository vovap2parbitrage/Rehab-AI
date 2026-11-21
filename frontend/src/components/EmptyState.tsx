import type { ReactNode } from 'react'

interface EmptyStateProps {
  message: string
  title?: string
  icon?: ReactNode
  children?: ReactNode
}

export function EmptyState({ message, title, icon, children }: EmptyStateProps) {
  if (!title) return <p className="empty-state">{message}</p>

  return (
    <section className="card workspace-empty-state">
      {icon && <span className="workspace-empty-state__icon" aria-hidden="true">{icon}</span>}
      <h2>{title}</h2>
      <p>{message}</p>
      {children}
    </section>
  )
}
