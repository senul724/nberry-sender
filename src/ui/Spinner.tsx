import { cx } from './cx'

export function Spinner({
  className,
  label = 'Loading',
  decorative = false,
}: {
  className?: string
  label?: string
  /** Hide from assistive tech (e.g. inside a button that already has aria-busy). */
  decorative?: boolean
}) {
  return (
    <span {...(decorative ? { 'aria-hidden': true } : { role: 'status' })} className="inline-flex">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={cx('size-5 animate-spin', className)}
        fill="none"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {!decorative && <span className="sr-only">{label}</span>}
    </span>
  )
}
