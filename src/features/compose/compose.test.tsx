import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { Org } from '../../api/schemas'
import { ORIGIN, orgHandlers, testMe, testOrg } from '../../test/handlers'
import { renderApp } from '../../test/render'
import { server } from '../../test/server'
import { codePoints, payloadBytes, validateForm } from './validate'

const apiErr = (code: string, status: number, message = 'm') =>
  HttpResponse.json({ error: { code, message } }, { status })

interface Sent {
  title: string
  body: string
  data?: Record<string, string>
  idempotency_key: string
}

function setup(
  respond: (n: number, body: Sent) => Response | Promise<Response>,
  orgs: Org[] = [testOrg()],
  route = '/orgs/o1/compose',
) {
  const sent: { orgId: string; body: Sent }[] = []
  server.use(
    ...orgHandlers(orgs),
    http.post(`${ORIGIN}/v1/orgs/:id/broadcasts`, async ({ request, params }) => {
      const body = (await request.json()) as Sent
      sent.push({ orgId: String(params.id), body })
      return respond(sent.length, body)
    }),
  )
  return { sent, ...renderApp({ route, session: testMe }) }
}

const ok202 = () => HttpResponse.json({ message_id: 'm1', status: 'queued' }, { status: 202 })

async function fill(user: ReturnType<typeof userEvent.setup>, title = 'Hello', body = 'World') {
  await user.type(await screen.findByLabelText('Title'), title)
  await user.type(screen.getByLabelText('Message'), body)
}

const sendBtn = () => screen.getByRole('button', { name: 'Send broadcast' })

describe('compose sending', () => {
  it('double-click Send posts once while pending', async () => {
    const user = userEvent.setup()
    const { sent } = setup(async () => {
      await new Promise((r) => setTimeout(r, 50))
      return ok202()
    })
    await fill(user)
    await user.dblClick(sendBtn())
    expect(await screen.findByText(/Broadcast queued/)).toBeInTheDocument()
    expect(sent).toHaveLength(1)
  })

  it('two submits in the same tick post once (in-flight guard, not just isPending)', async () => {
    const user = userEvent.setup()
    const { sent } = setup(async () => {
      await new Promise((r) => setTimeout(r, 30))
      return ok202()
    })
    await fill(user)
    const form = sendBtn().closest('form')
    if (!form) throw new Error('no form')
    act(() => {
      form.requestSubmit()
      form.requestSubmit()
    })
    expect(await screen.findByText(/Broadcast queued/)).toBeInTheDocument()
    expect(sent).toHaveLength(1)
  })

  it('"Start a new message" is disabled while a send is pending', async () => {
    const user = userEvent.setup()
    setup(async () => {
      await new Promise((r) => setTimeout(r, 30))
      return ok202()
    })
    await fill(user)
    await user.click(sendBtn())
    expect(screen.getByRole('button', { name: 'Start a new message' })).toBeDisabled()
    expect(await screen.findByText(/Broadcast queued/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start a new message' })).toBeEnabled()
  })

  it('a failed send (500) then retry reuses the same idempotency_key', async () => {
    const user = userEvent.setup()
    const { sent } = setup((n) => (n === 1 ? apiErr('internal', 500, 'boom') : ok202()))
    await fill(user)
    await user.click(sendBtn())
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    await user.click(sendBtn())
    expect(await screen.findByText(/Broadcast queued/)).toBeInTheDocument()
    expect(sent).toHaveLength(2)
    expect(sent[1]?.body.idempotency_key).toBe(sent[0]?.body.idempotency_key)
    expect(sent[0]?.body.idempotency_key).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('after a successful send the next send uses a new key, and a link to Messages is shown', async () => {
    const user = userEvent.setup()
    const { sent } = setup(() => ok202())
    await fill(user)
    await user.click(sendBtn())
    expect(await screen.findByText(/Broadcast queued/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View in Messages' })).toHaveAttribute(
      'href',
      '/orgs/o1/messages',
    )
    expect(screen.getByLabelText('Title')).toHaveValue('')
    await fill(user, 'Second', 'Again')
    await user.click(sendBtn())
    await waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[1]?.body.idempotency_key).not.toBe(sent[0]?.body.idempotency_key)
  })

  it('sends data only when rows are filled in', async () => {
    const user = userEvent.setup()
    const { sent } = setup(() => ok202())
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Add data' }))
    await user.type(screen.getByLabelText('Key 1'), 'deep_link')
    await user.type(screen.getByLabelText('Value 1'), '/offers')
    await user.click(sendBtn())
    await screen.findByText(/Broadcast queued/)
    expect(sent[0]?.body).toMatchObject({
      title: 'Hello',
      body: 'World',
      data: { deep_link: '/offers' },
    })
  })

  it('409 idempotency_conflict shows the start-new message and Start new regenerates the key', async () => {
    const user = userEvent.setup()
    const { sent } = setup((n) => (n === 1 ? apiErr('idempotency_conflict', 409) : ok202()))
    await fill(user)
    await user.click(sendBtn())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This message was already sent with different content. Start a new message.',
    )
    await user.click(screen.getByRole('button', { name: 'Start a new message' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('')
    await fill(user, 'Fresh', 'Content')
    await user.click(sendBtn())
    await screen.findByText(/Broadcast queued/)
    expect(sent[1]?.body.idempotency_key).not.toBe(sent[0]?.body.idempotency_key)
  })

  it('429 shows the shared hourly limit copy', async () => {
    const user = userEvent.setup()
    setup(() => apiErr('rate_limited', 429))
    await fill(user)
    await user.click(sendBtn())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your org reached its limit of 100 broadcasts per hour (shared with your servers).',
    )
  })

  it.each([
    ['org_not_verified', 'Sending is blocked: this sender is pending verification'],
    ['org_suspended', 'Sending is blocked: this sender is suspended'],
  ])('403 %s shows the status banner copy', async (code, copy) => {
    const user = userEvent.setup()
    setup(() => apiErr(code, 403))
    await fill(user)
    await user.click(sendBtn())
    expect(await screen.findByRole('alert')).toHaveTextContent(copy)
  })

  it('404 says the user is no longer a member', async () => {
    const user = userEvent.setup()
    setup(() => apiErr('not_found', 404))
    await fill(user)
    await user.click(sendBtn())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You're no longer a member of this sender",
    )
  })

  it('400 shows the server message', async () => {
    const user = userEvent.setup()
    setup(() => apiErr('invalid_data', 400, 'data key "x" is reserved'))
    await fill(user)
    await user.click(sendBtn())
    expect(await screen.findByRole('alert')).toHaveTextContent('data key "x" is reserved')
  })

  it('a send in org A does not leak into org B: draft is cleared and the key differs', async () => {
    const user = userEvent.setup()
    const orgs = [testOrg({ id: 'o1', name: 'Alpha' }), testOrg({ id: 'o2', name: 'Beta' })]
    const { sent, router } = setup(
      (n) => (n === 1 ? apiErr('internal', 500, 'boom') : ok202()),
      orgs,
    )
    await fill(user, 'Draft A', 'Body A')
    await user.click(sendBtn())
    await screen.findByText('boom')
    await user.selectOptions(screen.getByLabelText('Sender'), 'o2')
    await waitFor(() => expect(router.state.location.pathname).toBe('/orgs/o2/compose'))
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue(''))
    expect(screen.getByLabelText('Message')).toHaveValue('')
    expect(screen.queryByText('boom')).not.toBeInTheDocument()
    await fill(user, 'Draft B', 'Body B')
    await user.click(sendBtn())
    await screen.findByText(/Broadcast queued/)
    expect(sent[1]?.orgId).toBe('o2')
    expect(sent[1]?.body.idempotency_key).not.toBe(sent[0]?.body.idempotency_key)
  })
})

describe('compose client-side validation', () => {
  it('reserved and google-prefixed data keys are rejected client-side', async () => {
    const user = userEvent.setup()
    const { sent } = setup(() => ok202())
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Add data' }))
    await user.type(screen.getByLabelText('Key 1'), 'message_id')
    await user.click(sendBtn())
    expect(await screen.findByRole('alert')).toHaveTextContent('"message_id" is reserved')
    await user.clear(screen.getByLabelText('Key 1'))
    await user.type(screen.getByLabelText('Key 1'), 'GoogleFoo')
    await user.click(sendBtn())
    expect(await screen.findByRole('alert')).toHaveTextContent('"GoogleFoo" is reserved')
    await user.clear(screen.getByLabelText('Key 1'))
    await user.type(screen.getByLabelText('Key 1'), 'gcm.x')
    await user.click(sendBtn())
    expect(await screen.findByRole('alert')).toHaveTextContent('"gcm.x" is reserved')
    expect(sent).toHaveLength(0)
  })

  it('requires a title and a message and posts nothing', async () => {
    const user = userEvent.setup()
    const { sent } = setup(() => ok202())
    await screen.findByLabelText('Title')
    await user.click(sendBtn())
    expect(screen.getByText('Title must be 1 to 200 characters')).toBeInTheDocument()
    expect(screen.getByText('Message must be 1 to 2000 characters')).toBeInTheDocument()
    expect(sent).toHaveLength(0)
  })

  it('shows the live "about" byte counter', async () => {
    const user = userEvent.setup()
    setup(() => ok202())
    await user.type(await screen.findByLabelText('Title'), 'Hi')
    await user.type(screen.getByLabelText('Message'), 'Yo')
    expect(screen.getByText('About 6 of 3500 bytes')).toBeInTheDocument() // 2 + 2 + "{}"
  })
})

describe('validate()', () => {
  const none: never[] = []
  it('counts code points, not UTF-16 units', () => {
    expect(codePoints('😀😀')).toBe(2)
    expect(validateForm('😀'.repeat(200), 'b', none).title).toBeUndefined()
    expect(validateForm('😀'.repeat(201), 'b', none).title).toBeDefined()
  })
  it('rejects control characters; the body may keep newline and tab', () => {
    expect(validateForm('a\nb', 'b', none).title).toBeDefined()
    expect(validateForm('a‮b', 'b', none).title).toBeDefined()
    expect(validateForm('t', 'a\nb\tc', none).body).toBeUndefined()
    expect(validateForm('t', 'a\rb', none).body).toBeDefined()
    expect(validateForm('t', 'a​b', none).body).toBeDefined()
    expect(validateForm('t', '\u{1F469}‍\u{1F4BB}', none).body).toBeUndefined()
  })
  it('counts UTF-8 bytes and enforces 3500', () => {
    expect(payloadBytes('é', 'b', none)).toBe(2 + 1 + 2)
    expect(validateForm('t', 'x'.repeat(2000), none).data).toBeUndefined()
    expect(validateForm('t', 'é'.repeat(1700), none).data).toBeUndefined()
    expect(validateForm('é'.repeat(200), 'é'.repeat(1600), none).data).toMatch(/too large/)
  })
  it('validates data keys, duplicates and the 30 key limit', () => {
    const row = (id: string, key: string) => ({ id, key, value: 'v' })
    expect(validateForm('t', 'b', [row('1', 'bad key')]).rows['1']).toBeDefined()
    expect(validateForm('t', 'b', [row('1', 'k'.repeat(65))]).rows['1']).toBeDefined()
    expect(validateForm('t', 'b', [row('1', 'a'), row('2', 'a')]).rows['2']).toMatch(/twice/)
    expect(validateForm('t', 'b', [{ id: '1', key: '', value: 'v' }]).rows['1']).toBeDefined()
    expect(validateForm('t', 'b', [{ id: '1', key: '', value: '' }]).rows).toEqual({})
    const many = Array.from({ length: 31 }, (_, i) => row(String(i), `k${i}`))
    expect(validateForm('t', 'b', many).data).toBeDefined()
  })
})
