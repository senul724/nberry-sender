import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { Org, Role } from '../api/schemas'
import { forbidden, ORIGIN, orgHandlers, testMe, testOrg, testStats } from '../test/handlers'
import { renderApp } from '../test/render'
import { server } from '../test/server'

const apiErr = (code: string, status: number, message = 'm') =>
  HttpResponse.json({ error: { code, message } }, { status })

function setup(orgs: Org[], route: string, opts: Parameters<typeof orgHandlers>[1] = {}) {
  server.use(...orgHandlers(orgs, opts))
  return renderApp({ route, session: testMe })
}

const nav = () => within(screen.getByRole('navigation', { name: 'Main' }))

describe('first sender and index', () => {
  it('a user with no orgs sees "Create your first sender" and creating one navigates to /orgs/:id', async () => {
    const user = userEvent.setup()
    const orgs: Org[] = []
    let body: unknown
    server.use(
      http.post(`${ORIGIN}/v1/orgs`, async ({ request }) => {
        body = await request.json()
        const created = testOrg({ id: 'o9', name: 'Fresh' })
        orgs.push(created)
        return HttpResponse.json(created, { status: 201 })
      }),
    )
    const { router } = setup(orgs, '/')
    expect(
      await screen.findByRole('heading', { name: 'Create your first sender' }),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText('Name'), 'Fresh')
    await user.click(screen.getByRole('button', { name: 'Create sender' }))
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/orgs/o9')
    expect(body).toEqual({ name: 'Fresh' })
  })

  it('index redirects to the first org', async () => {
    const { router } = setup([testOrg({ id: 'a1', name: 'First' }), testOrg({ id: 'b2' })], '/')
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/orgs/a1')
  })

  it('shows an error with retry when the org list fails', async () => {
    server.use(http.get(`${ORIGIN}/v1/orgs`, () => apiErr('internal', 500, 'boom')))
    renderApp({ route: '/', session: testMe })
    expect((await screen.findAllByText('boom')).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0)
  })

  it.each([
    ['too_many_orgs', 409, "You've reached the maximum number of senders."],
    ['invalid_callback_url', 400, 'That callback URL is not valid. Use a public https URL.'],
  ])('create shows %s', async (code, status, copy) => {
    const user = userEvent.setup()
    server.use(http.post(`${ORIGIN}/v1/orgs`, () => apiErr(code, status)))
    setup([], '/orgs/new')
    await user.type(await screen.findByLabelText('Name'), 'X')
    await user.type(screen.getByLabelText('Callback URL (optional)'), 'http://bad')
    await user.click(screen.getByRole('button', { name: 'Create sender' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(copy)
  })
})

describe('role-gated nav', () => {
  const always = [
    'Overview',
    'Compose',
    'Messages',
    'QR',
    'Customers',
    'API keys',
    'Team',
    'Developers',
  ]

  it.each<[Role, string[], string[]]>([
    ['developer', always, ['Settings', 'Danger zone']],
    ['admin', [...always, 'Settings'], ['Danger zone']],
    ['owner', [...always, 'Settings', 'Danger zone'], []],
  ])('%s sees the right links', async (role, shown, hidden) => {
    setup([testOrg({ my_role: role })], '/orgs/o1')
    await screen.findByRole('heading', { name: 'Overview' })
    for (const name of shown) expect(nav().getByRole('link', { name })).toBeInTheDocument()
    for (const name of hidden) expect(nav().queryByRole('link', { name })).not.toBeInTheDocument()
    expect(nav().getByRole('link', { name: 'Account' })).toBeInTheDocument()
    expect(nav().queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('shows Admin only for platform admins', async () => {
    server.use(...orgHandlers([testOrg()]))
    renderApp({ route: '/orgs/o1', session: { ...testMe, is_admin: true } })
    await screen.findByRole('navigation', { name: 'Main' })
    expect(await nav().findByRole('link', { name: 'Admin' })).toBeInTheDocument()
  })

  it.each<[Role, string]>([
    ['developer', '/orgs/o1/settings/danger'],
    ['admin', '/orgs/o1/settings/danger'],
    ['developer', '/orgs/o1/settings'],
  ])('a %s opening %s directly sees the no-access state', async (role, route) => {
    setup([testOrg({ my_role: role })], route)
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Danger zone|Settings/ })).not.toBeInTheDocument()
  })

  it('owner and admin can open settings; owner can open danger zone', async () => {
    setup([testOrg()], '/orgs/o1/settings/danger')
    expect(await screen.findByRole('heading', { name: 'Danger zone' })).toBeInTheDocument()
  })

  it('the mobile menu button toggles the navigation', async () => {
    const user = userEvent.setup()
    setup([testOrg()], '/orgs/o1')
    await screen.findByRole('heading', { name: 'Overview' })
    const menu = screen.getByRole('button', { name: 'Menu' })
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    await user.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    await user.click(nav().getByRole('link', { name: 'Messages' }))
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('org status and not found', () => {
  it.each([
    ['pending', 'Sending is blocked: this sender is pending verification'],
    ['suspended', 'Sending is blocked: this sender is suspended'],
  ] as const)('%s shows the banner', async (status, text) => {
    setup([testOrg({ status })], '/orgs/o1')
    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(screen.queryByText('✓ Verified')).not.toBeInTheDocument()
  })

  it('verified shows the badge and no banner', async () => {
    setup([testOrg()], '/orgs/o1')
    expect(await screen.findByText('✓ Verified')).toBeInTheDocument()
    expect(screen.queryByText(/Sending is blocked/)).not.toBeInTheDocument()
  })

  it('useOrg 404 shows "Sender not found" with a link home', async () => {
    setup([testOrg()], '/orgs/nope')
    expect(await screen.findByText('Sender not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to your senders' })).toHaveAttribute('href', '/')
  })

  it('other org load errors show retry', async () => {
    server.use(...orgHandlers([testOrg()]))
    server.use(http.get(`${ORIGIN}/v1/orgs/o1`, () => apiErr('internal', 500, 'boom')))
    renderApp({ route: '/orgs/o1', session: testMe })
    expect(await screen.findByText('boom')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('org switcher', () => {
  const two = () => [testOrg({ id: 'o1', name: 'Acme' }), testOrg({ id: 'o2', name: 'Beta' })]

  it('switches to the same sub-page of the chosen org', async () => {
    const user = userEvent.setup()
    const { router } = setup(two(), '/orgs/o1/messages')
    const select = await screen.findByLabelText('Sender')
    await screen.findByRole('option', { name: 'Beta' })
    await user.selectOptions(select, 'o2')
    expect(router.state.location.pathname).toBe('/orgs/o2/messages')
  })

  it('falls back to the overview when the sub-page is not allowed for the chosen org', async () => {
    const user = userEvent.setup()
    const { router } = setup(
      [
        testOrg({ id: 'o1', name: 'Acme' }),
        testOrg({ id: 'o2', name: 'Beta', my_role: 'developer' }),
      ],
      '/orgs/o1/settings',
    )
    const select = await screen.findByLabelText('Sender')
    await screen.findByRole('option', { name: 'Beta' })
    await user.selectOptions(select, 'o2')
    expect(router.state.location.pathname).toBe('/orgs/o2')
  })

  it('offers Create sender', async () => {
    const user = userEvent.setup()
    const { router } = setup(two(), '/orgs/o1')
    await user.click(await screen.findByRole('link', { name: 'Create sender' }))
    expect(router.state.location.pathname).toBe('/orgs/new')
  })
})

describe('overview', () => {
  it('renders the stat values and checklist states from the API', async () => {
    setup(
      [testOrg({ logo_url: 'https://cdn.example/l.png', callback_url: null, my_role: 'owner' })],
      '/orgs/o1',
      {
        apiKeys: [
          {
            id: 'k1',
            name: 'old',
            prefix: 'nb_live_a',
            created_at: '2026-11-01T00:00:00Z',
            revoked_at: '2026-11-02T00:00:00Z',
          },
          { id: 'k2', name: 'new', prefix: 'nb_live_b', created_at: '2026-11-01T00:00:00Z' },
        ],
      },
    )
    const tile = (label: string, value: string) => {
      const dt = screen.getByText(label)
      expect(dt.closest('div')).toHaveTextContent(value)
    }
    await screen.findByText('1,234')
    tile('Subscribers', '1,234')
    tile('Queued', String(testStats.messages_queued))
    tile('Sent', String(testStats.messages_sent))
    tile('Failed', String(testStats.messages_failed))
    tile('Active links', String(testStats.links_active))

    const item = async (name: string) =>
      (await screen.findByRole('link', { name })).closest('li') as HTMLElement
    expect(await item('Add a logo')).toHaveTextContent('Done')
    expect(await item('Set a callback URL')).toHaveTextContent('To do')
    expect(await item('Create an API key')).toHaveTextContent('Done')
    expect(screen.getByRole('link', { name: 'Print your QR' })).toHaveAttribute(
      'href',
      '/orgs/o1/qr',
    )
  })

  it('treats a 403 on the key list as unknown, not a page error', async () => {
    setup([testOrg()], '/orgs/o1', { apiKeys: 'forbidden' })
    const li = (await screen.findByRole('link', { name: 'Create an API key' })).closest('li')
    expect(await within(li as HTMLElement).findByText('Unknown')).toBeInTheDocument()
    expect(screen.getByText('1,234')).toBeInTheDocument()
  })

  it('shows an error with retry when stats fail, and still shows the checklist', async () => {
    server.use(...orgHandlers([testOrg()]))
    server.use(http.get(`${ORIGIN}/v1/orgs/o1/stats`, () => forbidden()))
    renderApp({ route: '/orgs/o1', session: testMe })
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a logo' })).toBeInTheDocument()
  })
})

describe('mobile menu closes on any navigation', () => {
  it('closes when the pathname changes by other means than a nav-link click', async () => {
    const user = userEvent.setup()
    const { router } = setup([testOrg()], '/orgs/o1')
    await screen.findByRole('heading', { name: 'Overview' })
    const menu = screen.getByRole('button', { name: 'Menu' })
    await user.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    await act(() => router.navigate('/orgs/o1/messages'))
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('does not reopen when you come back to the pathname it was opened on', async () => {
    const user = userEvent.setup()
    const { router } = setup([testOrg()], '/orgs/o1')
    await screen.findByRole('heading', { name: 'Overview' })
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await act(() => router.navigate('/orgs/o1/messages'))
    await act(() => router.navigate('/orgs/o1'))
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false')
  })
})
