import { useId, type TextareaHTMLAttributes } from 'react'
import { controlClass } from './fieldStyles'
import { cx } from './cx'

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string
  hint?: string
}

export function TextArea({ label, error, hint, id, className, rows = 4, ...rest }: TextAreaProps) {
  const auto = useId()
  const areaId = id ?? auto
  const errorId = `${areaId}-error`
  const hintId = `${areaId}-hint`
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined
  return (
    <div className="space-y-1">
      <label htmlFor={areaId} className="block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={areaId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(controlClass, className)}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="text-xs text-zinc-500 dark:text-zinc-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
