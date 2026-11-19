import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { ApiError, friendlyMessage } from '../../api/errors'
import { Send202 } from '../../api/schemas'
import { useCurrentOrg } from '../../orgs/context'
import { sendingBlockedMessage } from '../../orgs/blockedCopy'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { linkClass } from '../../ui/focus'
import { TextArea } from '../../ui/TextArea'
import { DataEditor } from './DataEditor'
import {
  codePoints,
  dataToObject,
  hasErrors,
  MAX_BODY,
  MAX_PAYLOAD_BYTES,
  MAX_TITLE,
  payloadBytes,
  validateForm,
  type DataRow,
  type FormErrors,
} from './validate'

const NO_ERRORS: FormErrors = { rows: {} }

function sendError(err: unknown, orgStatusCopy: (code: string) => string): string {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return 'Your org reached its limit of 100 broadcasts per hour (shared with your servers).'
    }
    if (err.code === 'org_not_verified' || err.code === 'org_suspended') {
      return orgStatusCopy(err.code)
    }
    if (err.status === 404) return "You're no longer a member of this sender"
    if (err.status === 400 && err.message) return err.message
  }
  return friendlyMessage(err)
}

export function ComposePage() {
  const org = useCurrentOrg()
  const queryClient = useQueryClient()
  const rowSeq = useRef(0)
  const newRowId = () => `row-${rowSeq.current++}`

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [rows, setRows] = useState<DataRow[]>([])
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS)
  // One key per compose attempt: reused on retry and double-click, renewed after a success.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [sent, setSent] = useState(false)

  const send = useMutation({
    mutationFn: (key: string) =>
      api.post(`/v1/orgs/${encodeURIComponent(org.id)}/broadcasts`, {
        schema: Send202,
        body: {
          title,
          body,
          ...(rows.length > 0 && { data: dataToObject(rows) }),
          idempotency_key: key,
        },
      }),
    onSuccess: () => {
      setTitle('')
      setBody('')
      setRows([])
      setIdempotencyKey(crypto.randomUUID())
      setSent(true)
      void queryClient.invalidateQueries({ queryKey: ['orgs', org.id, 'messages'] })
      void queryClient.invalidateQueries({ queryKey: ['orgs', org.id, 'stats'] })
    },
  })

  const startNew = () => {
    setTitle('')
    setBody('')
    setRows([])
    setErrors(NO_ERRORS)
    setSent(false)
    setIdempotencyKey(crypto.randomUUID())
    send.reset()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (send.isPending) return
    const found = validateForm(title, body, rows)
    setErrors(found)
    if (hasErrors(found)) return
    setSent(false)
    send.mutate(idempotencyKey)
  }

  const bytes = payloadBytes(title, body, rows)
  const conflict = send.error instanceof ApiError && send.error.code === 'idempotency_conflict'

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Compose</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Send a broadcast to everyone who follows this sender.
      </p>

      {sent && (
        <Banner tone="success">
          Broadcast queued.{' '}
          <Link to={`/orgs/${org.id}/messages`} className={linkClass}>
            View in Messages
          </Link>
        </Banner>
      )}
      {send.isError && (
        <Banner tone="error">
          {sendError(send.error, (code) =>
            sendingBlockedMessage(code === 'org_suspended' ? 'suspended' : 'pending'),
          )}
        </Banner>
      )}

      <form onSubmit={submit} noValidate className="space-y-5">
        <Field
          label="Title"
          value={title}
          error={errors.title}
          hint={`${codePoints(title)} / ${MAX_TITLE}`}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextArea
          label="Message"
          rows={6}
          value={body}
          error={errors.body}
          hint={`${codePoints(body)} / ${MAX_BODY}`}
          onChange={(e) => setBody(e.target.value)}
        />
        <DataEditor rows={rows} errors={errors.rows} onChange={setRows} newId={newRowId} />
        {errors.data && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {errors.data}
          </p>
        )}
        <p
          className={
            bytes > MAX_PAYLOAD_BYTES
              ? 'text-sm text-red-600 dark:text-red-400'
              : 'text-sm text-zinc-500 dark:text-zinc-400'
          }
        >
          About {bytes} of {MAX_PAYLOAD_BYTES} bytes
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={send.isPending}>
            Send broadcast
          </Button>
          <Button variant={conflict ? 'secondary' : 'ghost'} onClick={startNew}>
            Start a new message
          </Button>
        </div>
      </form>
    </div>
  )
}
