import { getRoleLabel } from '../lib/profile'

interface RoleBadgeProps {
  role: string
  size?: 'sm' | 'md'
}

export function RoleBadge({ role, size = 'md' }: RoleBadgeProps) {
  const modifier = ['patient', 'therapist', 'admin'].includes(role) ? role : 'unknown'

  return (
    <span className={`role-badge role-badge--${modifier} role-badge--${size}`}>
      <span className="role-badge__dot" aria-hidden="true" />
      {getRoleLabel(role)}
    </span>
  )
}
