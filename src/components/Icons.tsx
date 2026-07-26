import type { ReactNode } from 'react'

interface IconProps {
  size?: number
  strokeWidth?: number
  className?: string
}

function svg(path: ReactNode, { size = 24, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  )
}

export const IconLibrary = (p: IconProps) =>
  svg(
    <>
      <rect x="3" y="4.5" width="7" height="15" rx="1.6" />
      <rect x="13" y="4.5" width="7" height="15" rx="1.6" />
      <path d="M6.5 8.5h0M16.5 8.5h0" strokeWidth={2.4} />
    </>,
    p,
  )

export const IconSearch = (p: IconProps) =>
  svg(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5L21 21" />
    </>,
    p,
  )

export const IconUser = (p: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1.5-3.5 4.2-5 7.5-5s6 1.5 7.5 5" />
    </>,
    p,
  )

/** Gamepad — the app's signature mark. */
export const IconPad = (p: IconProps) =>
  svg(
    <>
      <path d="M7.5 8h9a4.5 4.5 0 0 1 4.4 3.6l.8 4A3.2 3.2 0 0 1 18.6 19c-1 0-1.9-.5-2.5-1.3L15 16H9l-1.1 1.7C7.3 18.5 6.4 19 5.4 19a3.2 3.2 0 0 1-3.1-3.4l.8-4A4.5 4.5 0 0 1 7.5 8z" />
      <path d="M7 12.5h2.4M8.2 11.3v2.4" />
      <path d="M15.5 11.8h.01M17.5 13.5h.01" strokeWidth={2.4} />
    </>,
    p,
  )

export const IconPlay = (p: IconProps) => svg(<path d="M8 5.5l11 6.5-11 6.5z" />, p)

export const IconEye = (p: IconProps) =>
  svg(
    <>
      <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.8" />
    </>,
    p,
  )

export const IconCheck = (p: IconProps) => svg(<path d="M5 12.5l4.5 4.5L19 7.5" />, p)

export const IconPlus = (p: IconProps) => svg(<path d="M12 5v14M5 12h14" />, p)

export const IconBack = (p: IconProps) => svg(<path d="M15 5l-7 7 7 7" />, p)

export const IconX = (p: IconProps) => svg(<path d="M6 6l12 12M18 6L6 18" />, p)

export const IconTrash = (p: IconProps) =>
  svg(
    <>
      <path d="M4 7h16M10 4h4M6.5 7l1 13h9l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>,
    p,
  )

export const IconStar = (p: IconProps) =>
  svg(<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" />, p)

export const IconDownload = (p: IconProps) =>
  svg(
    <>
      <path d="M12 4v11M7 10.5l5 5 5-5" />
      <path d="M4.5 19.5h15" />
    </>,
    p,
  )

export const IconUpload = (p: IconProps) =>
  svg(
    <>
      <path d="M12 15V4M7 8.5l5-5 5 5" />
      <path d="M4.5 19.5h15" />
    </>,
    p,
  )

export const IconHeart = (p: IconProps) =>
  svg(<path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20z" />, p)

export const IconExternal = (p: IconProps) =>
  svg(
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-8.5 8.5" />
      <path d="M19 14v4.5A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-11A1.5 1.5 0 0 1 6.5 6H11" />
    </>,
    p,
  )

export const IconMail = (p: IconProps) =>
  svg(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </>,
    p,
  )

/* Filled, unlike the rest: the wordmark is a solid glyph and an outline reads as broken. */
export const IconLinkedIn = ({ size = 24, className }: IconProps) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM3 9.5h4v11H3v-11zm7 0h3.8v1.5h.05c.53-.95 1.83-1.95 3.75-1.95 4 0 4.75 2.5 4.75 5.8v5.65h-4v-5c0-1.2-.02-2.75-1.7-2.75-1.7 0-1.96 1.3-1.96 2.66v5.09h-4v-11z" />
  </svg>
)
