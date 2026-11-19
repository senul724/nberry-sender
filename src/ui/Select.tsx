import { useId, type SelectHTMLAttributes } from 'react'
import { controlClass } from './fieldStyles'
import { cx } from './cx'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string
}

export function Select({ label, error, id, className, children, ...rest }: SelectProps) {
  const auto = useId()
  const selectId = id ?? auto
  const errorId = `${selectId}-error`
  return (
    <div className="space-y-1">
      <label htmlFor={selectId} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cx(controlClass, className)}
        {...rest}
      >
        {children}
      </select>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
