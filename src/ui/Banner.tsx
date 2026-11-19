import type { ReactNode } from 'react'
import { cx } from './cx'

type Tone = 'info' | 'success' | 'warning' | 'error'

const tones: Record<Tone, string> = {
  info: 'border-berry-200 bg-berry-50 text-berry-900 dark:border-berry-800 dark:bg-berry-900/30 dark:text-berry-100',
  success:
    'border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-900/30 dark:text-green-100',
  warning:
    'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-100',
  error:
    'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/30 dark:text-red-100',
}

export function Banner({
  tone = 'info',
  children,
  className,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('rounded-md border px-4 py-3 text-sm', tones[tone], className)}
    >
      {children}
    </div>
  )
}
