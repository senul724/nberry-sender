import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { Session } from '../../api/schemas'
import { ORIGIN, testMe } from '../../test/handlers'
import { renderApp } from '../../test/render'
import { server } from '../../test/server'

const sessions: Session[] = [
  {
    id: 's1',
    client: 'web',
    device_name: 'Chrome on macOS',
    platform: 'web',
    ip: '1.2.3.4',
    created_at: '2026-11-01T00:00:00Z',
    last_used_at: '2026-11-19T00:00:00Z',
    current: true,
  },
  {
    id: 's2',
    client: 'web',
    device_name: 'Firefox on Linux',
    platform: 'web',
    ip: '5.6.7.8',
    created_at: '2026-11-02T00:00:00Z',
    last_used_at: null,
    current: false,
  },
]

function err(status: number, code: string, extra: object = {}) {
  return HttpResponse.json({ error: { code, message: 'x' }, ...extra }, { status })
}

function setup(list: Session[] = sessions) {
  const live = [...list]
  server.use(http.get(`${ORIGIN}/v1/me/sessions`, () => HttpResponse.json({ sessions: live })))
  return { live, ...renderApp({ route: '/account', session: testMe }) }
}

const region = (name: string) => within(screen.getByRole('region', { name }))

describe('account', () => {
  it('saves the profile name', async () => {
    const user = userEvent.setup()
    const bodies: unknown[] = []
    server.use(
      http.patch(`${ORIGIN}/v1/me`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ ...testMe, name: 'Ada B' })
      }),
    )
    setup()
    const input = await screen.findByLabelText('Name')
    await user.clear(input)
    await user.type(input, 'Ada B')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(bodies).toEqual([{ name: 'Ada B' }]))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('2FA toggle sends enabled and password', async () => {
    const user = userEvent.setup()
    const bodies: unknown[] = []
    server.use(
      http.put(`${ORIGIN}/v1/me/2fa`, async ({ request }) => {
        bodies.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )
    setup()
    await screen.findByRole('region', { name: 'Two-step verification' })
    await user.type(region('Two-step verification').getByLabelText('Password'), 'hunter2hunter2')
    await user.click(region('Two-step verification').getByRole('button', { name: 'Turn on' }))
    await waitFor(() => expect(bodies).toEqual([{ enabled: true, password: 'hunter2hunter2' }]))
  })

  it('email change: request then confirm code', async () => {
    const user = userEvent.setup()
    const calls: { path: string; body: unknown }[] = []
    server.use(
      http.post(`${ORIGIN}/v1/me/email`, async ({ request }) => {
        calls.push({ path: 'request', body: await request.json() })
        return HttpResponse.json(
          { message: "If that account exists, we've sent a code" },
          { status: 202 },
        )
      }),
      http.post(`${ORIGIN}/v1/me/email/confirm`, async ({ request }) => {
        calls.push({ path: 'confirm', body: await request.json() })
        return new HttpResponse(null, { status: 204 })
      }),
    )
    setup()
    await screen.findByRole('region', { name: 'Email address' })
    const r = region('Email address')
    await user.type(r.getByLabelText('New email'), 'new@example.com')
    await user.type(r.getByLabelText('Password'), 'pw-pw-pw-pw')
    await user.click(r.getByRole('button', { name: 'Send code' }))
    await user.type(await r.findByLabelText('Code'), '123456')
    await user.click(r.getByRole('button', { name: 'Confirm email' }))
    expect(await screen.findByText('Email updated')).toBeInTheDocument()
    expect(calls).toEqual([
      { path: 'request', body: { new_email: 'new@example.com', password: 'pw-pw-pw-pw' } },
      { path: 'confirm', body: { code: '123456' } },
    ])
  })

  it('revoking a session removes it; current session has no revoke button', async () => {
    const user = userEvent.setup()
    const { live } = setup()
    server.use(
      http.delete(`${ORIGIN}/v1/me/sessions/:id`, ({ params }) => {
        live.splice(
          live.findIndex((s) => s.id === params.id),
          1,
        )
        return new HttpResponse(null, { status: 204 })
      }),
    )
    expect(await screen.findByText('Chrome on macOS')).toBeInTheDocument()
    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revoke Chrome on macOS' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Revoke Firefox on Linux' }))
    await waitFor(() => expect(screen.queryByText('Firefox on Linux')).not.toBeInTheDocument())
  })

  it('sign out everywhere else calls DELETE /v1/me/sessions', async () => {
    const user = userEvent.setup()
    let called = 0
    setup()
    server.use(
      http.delete(`${ORIGIN}/v1/me/sessions`, () => {
        called++
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await user.click(await screen.findByRole('button', { name: 'Sign out everywhere else' }))
    await waitFor(() => expect(called).toBe(1))
  })

  it('delete account sole_owner lists the orgs with links', async () => {
    const user = userEvent.setup()
    server.use(
      http.delete(`${ORIGIN}/v1/me`, () =>
        err(409, 'sole_owner', {
          orgs: [
            { id: 'o1', name: 'Acme Coffee' },
            { id: 'o2', name: 'Bean Co' },
          ],
        }),
      ),
    )
    setup()
    const r = await screen.findByRole('region', { name: 'Delete account' })
    await user.type(within(r).getByLabelText('Password'), 'pw-pw-pw-pw')
    await user.click(within(r).getByRole('button', { name: 'Delete account' }))
    const link = await screen.findByRole('link', { name: 'Acme Coffee' })
    expect(link).toHaveAttribute('href', '/orgs/o1/team')
    expect(screen.getByRole('link', { name: 'Bean Co' })).toHaveAttribute('href', '/orgs/o2/team')
  })

  it('delete account reauth_required shows the Google re-auth prompt', async () => {
    const user = userEvent.setup()
    server.use(http.delete(`${ORIGIN}/v1/me`, () => err(403, 'reauth_required')))
    renderApp({ route: '/account', session: { ...testMe, has_password: false } })
    server.use(http.get(`${ORIGIN}/v1/me/sessions`, () => HttpResponse.json({ sessions })))
    const r = await screen.findByRole('region', { name: 'Delete account' })
    expect(within(r).queryByLabelText('Password')).not.toBeInTheDocument()
    await user.click(within(r).getByRole('button', { name: 'Delete account' }))
    expect(await screen.findByText('Sign in with Google again to confirm')).toBeInTheDocument()
  })

  it('successful delete goes to /login', async () => {
    const user = userEvent.setup()
    let body: unknown
    server.use(
      http.delete(`${ORIGIN}/v1/me`, async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router } = setup()
    const r = await screen.findByRole('region', { name: 'Delete account' })
    await user.type(within(r).getByLabelText('Password'), 'pw-pw-pw-pw')
    await user.click(within(r).getByRole('button', { name: 'Delete account' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(body).toEqual({ password: 'pw-pw-pw-pw' })
  })
})
