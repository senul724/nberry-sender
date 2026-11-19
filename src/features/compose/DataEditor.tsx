import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { MAX_DATA_KEYS, type DataRow } from './validate'

/** Optional key/value rows for the broadcast `data` map. */
export function DataEditor({
  rows,
  errors,
  onChange,
  newId,
}: {
  rows: DataRow[]
  errors: Record<string, string>
  onChange: (rows: DataRow[]) => void
  newId: () => string
}) {
  const update = (id: string, patch: Partial<DataRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Extra data (optional)</legend>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Key/value pairs your app receives with the notification.
      </p>
      {rows.map((r, i) => (
        <div key={r.id} className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Field
            label={`Key ${i + 1}`}
            value={r.key}
            error={errors[r.id]}
            onChange={(e) => update(r.id, { key: e.target.value })}
            autoComplete="off"
          />
          <Field
            label={`Value ${i + 1}`}
            value={r.value}
            onChange={(e) => update(r.id, { value: e.target.value })}
            autoComplete="off"
          />
          <Button
            variant="ghost"
            className="sm:mt-6"
            aria-label={`Remove row ${i + 1}`}
            onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        disabled={rows.length >= MAX_DATA_KEYS}
        onClick={() => onChange([...rows, { id: newId(), key: '', value: '' }])}
      >
        Add data
      </Button>
    </fieldset>
  )
}
