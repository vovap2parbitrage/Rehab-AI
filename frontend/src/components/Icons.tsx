import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export function LogoMark(props: IconProps) {
  return (
    <IconBase strokeWidth="2" {...props}>
      <path d="M3.5 13h3.2l1.7-4.7 2.9 9.2 2.1-6 1.3 3 1.6-1.5h4.2" />
    </IconBase>
  )
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </IconBase>
  )
}

export function ShieldCheckIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3 5 6v5c0 4.4 2.9 8.3 7 9.7 4.1-1.4 7-5.3 7-9.7V6l-7-3Z" />
      <path d="m9.2 12 1.9 1.9 3.8-3.8" />
    </IconBase>
  )
}

export function ActivityIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 12h4l2.2-6 4 12 2.1-6H21" />
    </IconBase>
  )
}

export function SparklesIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m12 3 1.2 3.5L17 8l-3.8 1.5L12 13l-1.2-3.5L7 8l3.8-1.5L12 3Z" />
      <path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
      <path d="m5.5 14 .6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6Z" />
    </IconBase>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m5 12.5 4.2 4.2L19 7" />
    </IconBase>
  )
}

export function UserIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </IconBase>
  )
}

export function MailIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </IconBase>
  )
}

export function LockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      <path d="M12 14v2.5" />
    </IconBase>
  )
}

export function LogoutIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 8l-4 4 4 4" />
      <path d="M6 12h10" />
    </IconBase>
  )
}

export function RefreshIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M20 11a8 8 0 0 0-14.9-4L3 10" />
      <path d="M3 5v5h5" />
      <path d="M4 13a8 8 0 0 0 14.9 4L21 14" />
      <path d="M21 19v-5h-5" />
    </IconBase>
  )
}

export function AlertTriangleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10.3 4.4 2.8 17.2A1.9 1.9 0 0 0 4.5 20h15a1.9 1.9 0 0 0 1.7-2.8L13.7 4.4a1.9 1.9 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 16.5h.01" />
    </IconBase>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </IconBase>
  )
}

export function ChartIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 20V5" />
      <path d="M4 20h16" />
      <path d="m7 15 4-4 3 2.5 5-6.5" />
    </IconBase>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M7.5 3v4M16.5 3v4M3.5 9.5h17" />
    </IconBase>
  )
}

export function HeartPulseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M20.4 5.6a4.9 4.9 0 0 0-7 0L12 7l-1.4-1.4a4.9 4.9 0 1 0-7 7L12 21l8.4-8.4a4.9 4.9 0 0 0 0-7Z" />
      <path d="M3.8 12h4l1.4-3.4 2.6 6.4 1.4-3H21" />
    </IconBase>
  )
}
