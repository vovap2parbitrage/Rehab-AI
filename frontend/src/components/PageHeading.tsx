import type { ReactNode } from 'react'

interface PageHeadingProps {
  eyebrow?: string
  title: string
  lead?: string
  children?: ReactNode
}

export function PageHeading({ eyebrow, title, lead, children }: PageHeadingProps) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {lead && <p className="page-heading__lead">{lead}</p>}
      </div>
      {children}
    </header>
  )
}
