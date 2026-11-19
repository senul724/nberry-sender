import { useEffect, useRef, useState } from 'react'
import { config } from '../../config'
import { Button } from '../../ui/Button'

const KEY = 'nb_live_…'

interface Endpoint {
  title: string
  method: 'GET' | 'POST' | 'DELETE'
  path: string
  /** The path as called in the examples (placeholders filled in). */
  call: string
  body?: Record<string, unknown>
  note: string
}

const ENDPOINTS: Endpoint[] = [
  {
    title: 'Send a broadcast',
    method: 'POST',
    path: '/v1/send/broadcasts',
    call: '/v1/send/broadcasts',
    body: { title: 'Fresh batch', body: 'New beans just landed.', idempotency_key: 'order-1042' },
    note: 'Returns 202 {message_id, status}. data and idempotency_key are optional.',
  },
  {
    title: 'Create an invite',
    method: 'POST',
    path: '/v1/send/invites',
    call: '/v1/send/invites',
    body: { customer_ref: 'cust_123', expires_in: 3600 },
    note: 'Returns {invite_id, invite_token, invite_url, expires_at}. Show invite_url as a QR code or link to your customer.',
  },
  {
    title: 'Get an invite',
    method: 'GET',
    path: '/v1/send/invites/{invite_id}',
    call: '/v1/send/invites/INVITE_ID',
    note: 'Check whether the invite was accepted.',
  },
  {
    title: 'Send a message to one customer',
    method: 'POST',
    path: '/v1/send/messages',
    call: '/v1/send/messages',
    body: { recipient_id: 'RECIPIENT_ID', title: 'Order ready', body: 'Your order is ready.' },
    note: 'recipient_id comes from the link.created callback. data and idempotency_key are optional.',
  },
  {
    title: 'Get a message',
    method: 'GET',
    path: '/v1/send/messages/{id}',
    call: '/v1/send/messages/MESSAGE_ID',
    note: 'Delivery status of one message.',
  },
  {
    title: 'Get a broadcast',
    method: 'GET',
    path: '/v1/send/broadcasts/{id}',
    call: '/v1/send/broadcasts/MESSAGE_ID',
    note: 'Delivery status of one broadcast.',
  },
  {
    title: 'Find links by customer reference',
    method: 'GET',
    path: '/v1/send/links?customer_ref=',
    call: '/v1/send/links?customer_ref=cust_123',
    note: 'Recover recipient_ids if a callback was missed.',
  },
  {
    title: 'Remove a link',
    method: 'DELETE',
    path: '/v1/send/links/{recipient_id}',
    call: '/v1/send/links/RECIPIENT_ID',
    note: 'Disconnects the customer; they stop receiving your messages.',
  },
]

function curlFor(base: string, e: Endpoint): string {
  const lines = [`curl -X ${e.method} '${base}${e.call}' \\`, `  -H 'Authorization: Bearer ${KEY}'`]
  if (e.body) {
    lines[1] += ' \\'
    lines.push(`  -H 'Content-Type: application/json' \\`)
    lines.push(`  -d '${JSON.stringify(e.body)}'`)
  }
  return lines.join('\n')
}

function nodeFor(base: string, e: Endpoint): string {
  const headers = e.body
    ? `{\n    Authorization: 'Bearer ${KEY}',\n    'Content-Type': 'application/json',\n  }`
    : `{ Authorization: 'Bearer ${KEY}' }`
  const bodyLine = e.body ? `\n  body: JSON.stringify(${JSON.stringify(e.body)}),` : ''
  return `const res = await fetch('${base}${e.call}', {
  method: '${e.method}',
  headers: ${headers},${bodyLine}
})
console.log(res.status, res.status === 204 ? null : await res.json())`
}

const VERIFY = `import crypto from 'node:crypto'
import express from 'express'

const app = express()
const SECRET = process.env.NBERRY_CALLBACK_SECRET // from Settings, keep it server-side
const seen = new Set() // use a shared store with expiry in production

// The signature covers the RAW body bytes, so read the body as a Buffer.
app.post('/nberry/callback', express.raw({ type: '*/*' }), (req, res) => {
  const header = String(req.headers['nberry-signature'] ?? '')
  const parts = {}
  for (const p of header.split(',')) {
    const i = p.indexOf('=')
    if (i > 0) parts[p.slice(0, i).trim()] = p.slice(i + 1).trim()
  }

  // Reject anything older (or newer) than 5 minutes.
  const t = Number(parts.t)
  if (!Number.isInteger(t) || Math.abs(Date.now() / 1000 - t) > 300) return res.sendStatus(400)

  // HMAC-SHA256 over "<t>.<rawBody>", compared in constant time.
  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(\`\${t}.\`)
    .update(req.body)
    .digest('hex')
  const got = Buffer.from(parts.v1 ?? '', 'utf8')
  const want = Buffer.from(expected, 'utf8')
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return res.sendStatus(401)

  // Events can be delivered more than once: dedupe on nBerry-Event-Id.
  const eventId = String(req.headers['nberry-event-id'] ?? '')
  if (seen.has(eventId)) return res.sendStatus(200)
  seen.add(eventId)

  const event = JSON.parse(req.body.toString('utf8'))
  // event: { event: 'link.created' | 'link.revoked', customer_ref, recipient_id, created_at }
  console.log(event.event, event.customer_ref, event.recipient_id)
  res.sendStatus(200)
})

app.listen(3000)`

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setState('copied')
    } catch {
      setState('failed')
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 2000)
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
        <Button variant="ghost" aria-label={`Copy ${label}`} onClick={() => void copy()}>
          {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function DevelopersPage() {
  // The API may live on another origin than the dashboard (VITE_API_BASE_URL).
  const base = config.apiBaseUrl || window.location.origin
  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold">Developers</h1>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Authentication</h2>
        <p className="text-sm">
          Call the sender API from your server at <code>{base}</code> with an API key from the API
          keys page: <code>Authorization: Bearer {KEY}</code>. Never put a key in a browser or
          mobile app.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Limits</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Title 1 to 200 characters, body 1 to 2000 characters.</li>
          <li>
            <code>data</code> is a flat map of strings: up to 30 keys matching{' '}
            <code>[A-Za-z0-9_.-]</code>, each at most 64 characters. Reserved keys:{' '}
            <code>message_id, org_id, kind, from, notification, message_type</code>.
          </li>
          <li>Title, body and data together are at most 3500 bytes.</li>
          <li>100 broadcasts per hour per sender; 60 messages per hour per link.</li>
        </ul>
      </section>

      {ENDPOINTS.map((e) => (
        <section key={e.title} className="space-y-3">
          <h2 className="text-lg font-semibold">{e.title}</h2>
          <p className="font-mono text-sm">
            {e.method} {e.path}
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{e.note}</p>
          <CodeBlock label={`curl: ${e.title}`} code={curlFor(base, e)} />
          <CodeBlock label={`Node: ${e.title}`} code={nodeFor(base, e)} />
        </section>
      ))}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Verify callbacks</h2>
        <p className="text-sm">
          When a customer links or unlinks, nBerry POSTs <code>link.created</code> or{' '}
          <code>link.revoked</code> to your callback URL with the body{' '}
          <code>{'{event, customer_ref, recipient_id, created_at}'}</code>. Each request carries{' '}
          <code>nBerry-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</code> (HMAC-SHA256 of{' '}
          <code>t + &quot;.&quot; + rawBody</code> with your callback secret) and{' '}
          <code>nBerry-Event-Id</code>. Events are retried for ~23 hours and may arrive out of
          order.
        </p>
        <CodeBlock label="Node: verify a callback" code={VERIFY} />
      </section>
    </div>
  )
}
