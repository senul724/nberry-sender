import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { Member, Org } from '../../api/schemas'
import { ORIGIN, orgHandlers, testMe, testOrg } from '../../test/handlers'
import { renderApp } from '../../test/render'
import { server } from '../../test/server'

const member = (over: Partial<Member>): Member => ({
  user_id: 'u9',
  email: 'bob@example.com',
  name: 'Bob',
  role: 'developer',
  joined_at: '2026-11-02T00:00:00Z',
  ...over,
})

const me = member({ user_id: 'u1', email: 'ada@example.com', name: 'Ada Lovelace', role: 'owner' })

function err(status: number, code: string) {
  return HttpResponse.json({ error: { code, message: 'x' } }, { status })
}

function setup(org: Org = testOrg(), members: Member[] = [me, member({})]) {
  const orgs = [org]
  const calls: { method: string; url: string; body: unknown }[] = []
  server.use(
    ...orgHandlers(orgs),
    http.get(`${ORIGIN}/v1/orgs/:id/members`, () => HttpResponse.json({ members })),
    http.post(`${ORIGIN}/v1/orgs/:id/members`, async ({ request }) => {
      calls.push({ method: 'POST', url: request.url, body: await request.json() })
      return HttpResponse.json(member({ user_id: 'u10', email: 'new@example.com' }), {
        status: 201,
      })
    }),
    http.patch(`${ORIGIN}/v1/orgs/:id/members/:uid`, async ({ request }) => {
      calls.push({ method: 'PATCH', url: request.url, body: await request.json() })
      return HttpResponse.json(member({}))
    }),
    http.delete(`${ORIGIN}/v1/orgs/:id/members/:uid`, ({ request, params }) => {
      calls.push({ method: 'DELETE', url: request.url, body: null })
      if (params.uid === 'u1') orgs.length = 0
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return { calls, orgs, ...renderApp({ route: '/orgs/o1/team', session: testMe }) }
}

describe('team', () => {
  it('owner adds a member; user_not_found shows the create-account copy', async () => {
    const user = userEvent.setup()
    const { calls } = setup()
    await user.type(await screen.findByLabelText('Email'), 'ghost@example.com')
    server.use(http.post(`${ORIGIN}/v1/orgs/:id/members`, () => err(404, 'user_not_found')))
    await user.click(screen.getByRole('button', { name: 'Add member' }))
    expect(
      await screen.findByText('Ask them to create an nBerry account first, then add them again.'),
    ).toBeInTheDocument()

    server.use(
      http.post(`${ORIGIN}/v1/orgs/:id/members`, async ({ request }) => {
        calls.push({ method: 'POST', url: request.url, body: await request.json() })
        return HttpResponse.json(member({}), { status: 201 })
      }),
    )
    await user.clear(screen.getByLabelText('Email'))
    await user.type(screen.getByLabelText('Email'), ' new@example.com ')
    await user.selectOptions(screen.getByLabelText('Role'), 'developer')
    await user.click(screen.getByRole('button', { name: 'Add member' }))
    await waitFor(() =>
      expect(calls).toEqual([
        {
          method: 'POST',
          url: `${ORIGIN}/v1/orgs/o1/members`,
          body: { email: 'new@example.com', role: 'developer' },
        },
      ]),
    )
  })

  it('shows friendly copy for already_member', async () => {
    const user = userEvent.setup()
    setup()
    server.use(http.post(`${ORIGIN}/v1/orgs/:id/members`, () => err(409, 'already_member')))
    await user.type(await screen.findByLabelText('Email'), 'bob@example.com')
    await user.click(screen.getByRole('button', { name: 'Add member' }))
    expect(await screen.findByText('That person is already on the team.')).toBeInTheDocument()
  })

  it('add-role select offers only admin and developer; change-role offers owner', async () => {
    setup()
    const add = await screen.findByLabelText('Role')
    expect(
      within(add)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Admin', 'Developer'])
    const change = await screen.findByLabelText('Role for bob@example.com')
    expect(
      within(change)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Owner', 'Admin', 'Developer'])
  })

  it('changing a role sends PATCH with the role', async () => {
    const user = userEvent.setup()
    const { calls } = setup()
    await user.selectOptions(await screen.findByLabelText('Role for bob@example.com'), 'owner')
    await waitFor(() =>
      expect(calls).toEqual([
        { method: 'PATCH', url: `${ORIGIN}/v1/orgs/o1/members/u9`, body: { role: 'owner' } },
      ]),
    )
  })

  it('non-owner sees the member list without controls', async () => {
    setup(testOrg({ my_role: 'admin' }))
    expect(await screen.findByText('bob@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Role/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
  })

  it('last_owner on demote shows friendly copy', async () => {
    const user = userEvent.setup()
    setup()
    server.use(http.patch(`${ORIGIN}/v1/orgs/:id/members/:uid`, () => err(409, 'last_owner')))
    await user.selectOptions(await screen.findByLabelText('Role for ada@example.com'), 'admin')
    expect(
      await screen.findByText('An organization must keep at least one owner.'),
    ).toBeInTheDocument()
  })

  it('removing a member asks first and sends DELETE', async () => {
    const user = userEvent.setup()
    const { calls } = setup()
    await user.click(await screen.findByRole('button', { name: 'Remove bob@example.com' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(calls).toEqual([
        { method: 'DELETE', url: `${ORIGIN}/v1/orgs/o1/members/u9`, body: null },
      ]),
    )
  })

  it('removing yourself navigates home after success and refetches orgs', async () => {
    const user = userEvent.setup()
    const { router } = setup()
    await user.click(await screen.findByRole('button', { name: 'Remove ada@example.com' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('Create your first sender')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })
})
