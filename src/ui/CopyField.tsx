import { useEffect, useId, useRef, useState } from 'react'
import { Button } from './Button'
import { controlClass } from './fieldStyles'
import { cx } from './cx'

export function CopyField({ label, value }: { label: string; value: string }) {
  const id = useId()
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setFailed(false)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
      setFailed(true)
    }
  }

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className={cx(controlClass, 'font-mono')}
        />
        <Button variant="secondary" onClick={copy}>
          Copy
        </Button>
      </div>
      <p role="status" className="min-h-5 text-sm text-green-700 dark:text-green-400">
        {copied ? 'Copied' : ''}
      </p>
      {failed && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Could not copy. Select the text and copy it manually.
        </p>
      )}
    </div>
  )
}
