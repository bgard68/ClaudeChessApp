import type { SVGProps } from 'react'

export type AppIconName =
  | 'archive'
  | 'arrow-left'
  | 'check'
  | 'clock'
  | 'computer'
  | 'draw'
  | 'engines'
  | 'first'
  | 'flip'
  | 'hint'
  | 'info'
  | 'last'
  | 'menu'
  | 'next'
  | 'palette'
  | 'pause'
  | 'play'
  | 'previous'
  | 'puzzle'
  | 'resign'
  | 'save'
  | 'sparkles'
  | 'trophy'
  | 'undo'
  | 'user'
  | 'warning'

interface AppIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  readonly name: AppIconName
  readonly size?: number
}

/**
 * Small, dependency-free icon set used by the presentation layer.
 *
 * Keeping these glyphs behind one component gives buttons and navigation a
 * consistent visual language without introducing a third-party icon package.
 */
export function AppIcon({ name, size = 18, className, ...props }: AppIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      {iconPath(name)}
    </svg>
  )
}

function iconPath(name: AppIconName) {
  switch (name) {
    case 'archive':
      return (
        <>
          <path d="M4 7h16v13H4z" />
          <path d="M3 4h18v3H3zM9 11h6" />
        </>
      )
    case 'arrow-left':
      return <path d="M19 12H5m6-6-6 6 6 6" />
    case 'check':
      return <path d="m5 12 4 4L19 6" />
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7v5l3 2" />
        </>
      )
    case 'computer':
      return (
        <>
          <rect x="4" y="5" width="16" height="11" rx="2" />
          <path d="M9 20h6m-3-4v4" />
        </>
      )
    case 'draw':
      return (
        <>
          <path d="M5 9h14M5 15h14" />
          <path d="m8 6-3 3 3 3m8 0 3 3-3 3" />
        </>
      )
    case 'engines':
      return (
        <>
          <rect x="3.5" y="5" width="7" height="10" rx="1.5" />
          <rect x="13.5" y="9" width="7" height="10" rx="1.5" />
          <path d="M7 18h3m4-12h3" />
        </>
      )
    case 'first':
      return (
        <>
          <path d="M6 6v12m12-12-7 6 7 6z" />
        </>
      )
    case 'flip':
      return (
        <>
          <path d="M7 7h10l-2.5-2.5M17 17H7l2.5 2.5" />
          <path d="M19 9a7 7 0 0 1 0 6M5 15a7 7 0 0 1 0-6" />
        </>
      )
    case 'hint':
      return (
        <>
          <path d="M9 18h6m-5 3h4" />
          <path d="M8.2 14.7A6 6 0 1 1 15.8 14.7C14.6 15.5 14 16.2 14 17h-4c0-.8-.6-1.5-1.8-2.3Z" />
        </>
      )
    case 'info':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5m0-8h.01" />
        </>
      )
    case 'last':
      return (
        <>
          <path d="m6 6 7 6-7 6zM18 6v12" />
        </>
      )
    case 'menu':
      return <path d="M5 7h14M5 12h14M5 17h14" />
    case 'next':
      return <path d="m8 6 8 6-8 6z" />
    case 'palette':
      return (
        <>
          <path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.4-3.4 1.7 1.7 0 0 1 1.2-2.9H18A3 3 0 0 0 21 12a9 9 0 0 0-9-9Z" />
          <path d="M7.5 10h.01M9.5 6.5h.01M14.5 6.5h.01M17 10h.01" />
        </>
      )
    case 'pause':
      return <path d="M9 6v12M15 6v12" />
    case 'play':
      return <path d="m9 6 8 6-8 6z" />
    case 'previous':
      return <path d="m16 6-8 6 8 6z" />
    case 'puzzle':
      return <path d="M4 9h4a2 2 0 1 0 4 0h4v4a2 2 0 1 1 0 4v3H4v-4a2 2 0 1 0 0-4V9Zm5-5h4v4a2 2 0 1 0 4 0V4h3v5" />
    case 'resign':
      return (
        <>
          <path d="M6 21V4m0 1h11l-2 3 2 3H6" />
        </>
      )
    case 'save':
      return (
        <>
          <path d="M5 4h12l2 2v14H5z" />
          <path d="M8 4v6h8V4M8 20v-6h8v6" />
        </>
      )
    case 'sparkles':
      return (
        <>
          <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" />
          <path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3ZM5.5 13l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9Z" />
        </>
      )
    case 'trophy':
      return (
        <>
          <path d="M8 4h8v3c0 4-1.7 6.5-4 7.5C9.7 13.5 8 11 8 7V4Z" />
          <path d="M8 6H5v1c0 2 1.2 3.4 3.5 3.7M16 6h3v1c0 2-1.2 3.4-3.5 3.7M12 15v3m-4 2h8" />
        </>
      )
    case 'undo':
      return <path d="M9 7 5 11l4 4M5 11h8a6 6 0 0 1 6 6" />
    case 'user':
      return (
        <>
          <circle cx="12" cy="8" r="3" />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
        </>
      )
    case 'warning':
      return (
        <>
          <path d="M12 3 2.8 20h18.4L12 3Z" />
          <path d="M12 9v5m0 3h.01" />
        </>
      )
  }
}
