import { cx } from './cx'

type Tone = 'neutral' | 'success' | 'warning' | 'error' | 'info'

const tones: Record<Tone, string> = {
  neutral: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  success: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  info: 'bg-berry-100 text-berry-800 dark:bg-berry-900/40 dark:text-berry-200',
}

export function StatusPill({ tone = 'neutral', label }: { tone?: Tone; label: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tones[tone],
      )}
    >
      {label}
    </span>
  )
}
