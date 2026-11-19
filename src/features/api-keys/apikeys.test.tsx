import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { ApiKey } from '../../api/schemas'
import { ORIGIN, orgHandlers, testMe, testOrg } from '../../test/handlers'
import { renderApp } from '../../test/render'
import { server } from '../../test/server'

const key = (over: Partial<ApiKey> = {}): ApiKey => ({
  id: 'k1',
  name: 'Server key',
  prefix: 'nb_live_ab12',
  created_by: 'u1',
  created_at: '2026-11-01T10:00:00Z',
  last_used_at: null,
  revoked_at: null,
  ...over,
})

const FULL = 'nb_live_abcdefghijklmnopqrstuvwxyz0123456789'

function setup(keys: ApiKey[]) {
  const posts: unknown[] = []
  const deletes: string[] = []
  server.use(
    ...orgHandlers([testOrg()], { apiKeys: keys }),
    http.get(`${ORIGIN}/v1/orgs/:id/api-keys`, () => HttpResponse.json({ api_keys: keys })),
    http.post(`${ORIGIN}/v1/orgs/:id/api-keys`, async ({ request }) => {
      const body = (await request.json()) as { name: string }
      posts.push(body)
      const created = key({ id: 'k2', name: body.name, prefix: 'nb_live_zz99' })
      keys.push(created)
      return HttpResponse.json({ ...created, key: FULL }, { status: 201 })
    }),
    http.delete(`${ORIGIN}/v1/orgs/:id/api-keys/:keyId`, ({ params }) => {
      deletes.push(String(params.keyId))
      const k = keys.find((x) => x.id === params.keyId)
      if (k) k.revoked_at = '2026-11-19T10:00:00Z'
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return { posts, deletes, ...renderApp({ route: '/orgs/o1/api-keys', session: testMe }) }
}

describe('API keys', () => {
  it('lists name, prefix, creator, created, last used and revoked state', async () => {
    setup([
      key(),
      key({
        id: 'k9',
        name: 'Old key',
        prefix: 'nb_live_old1',
        revoked_at: '2026-11-12T00:00:00Z',
      }),
    ])
    const row = await screen.findByRole('row', { name: /Server key/ })
    expect(within(row).getByText('nb_live_ab12')).toBeInTheDocument()
    expect(within(row).getByText('u1')).toBeInTheDocument()
    expect(within(row).getByText('Never')).toBeInTheDocument()
    const old = screen.getByRole('row', { name: /Old key/ })
    expect(within(old).getByText('Revoked')).toBeInTheDocument()
    expect(within(old).queryByRole('button', { name: /Revoke/ })).not.toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    setup([])
    expect(await screen.findByText('No API keys yet')).toBeInTheDocument()
  })

  it('new API key is shown once, copyable, and absent after the dialog closes; never in the query cache', async () => {
    const user = userEvent.setup()
    const { queryClient, posts } = setup([])
    await user.click(await screen.findByRole('button', { name: 'Create API key' }))
    await user.type(screen.getByLabelText('Name'), 'CI key')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create key' }))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByLabelText('API key')).toHaveValue(FULL)
    expect(within(dialog).getByText(/You won't see this key again/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(posts).toEqual([{ name: 'CI key' }])

    const dump = () =>
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((q) => q.state),
      ) +
      JSON.stringify(
        queryClient
          .getMutationCache()
          .getAll()
          .map((m) => m.state),
      )
    expect(dump()).not.toContain(FULL)

    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(screen.queryByDisplayValue(FULL)).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('nb_live_zz99')).toBeInTheDocument()
    expect(dump()).not.toContain(FULL)

    // Reopening starts from a blank form: the key is not remembered.
    await user.click(screen.getByRole('button', { name: 'Create API key' }))
    expect(screen.queryByDisplayValue(FULL)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('')
  })

  it('Escape also drops the key', async () => {
    const user = userEvent.setup()
    setup([])
    await user.click(await screen.findByRole('button', { name: 'Create API key' }))
    await user.type(screen.getByLabelText('Name'), 'CI key')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create key' }))
    await screen.findByDisplayValue(FULL)
    await user.keyboard('{Escape}')
    expect(screen.queryByDisplayValue(FULL)).not.toBeInTheDocument()
  })

  it('cannot be closed while the create request is in flight, so the key is not lost', async () => {
    const user = userEvent.setup()
    setup([])
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => (release = r))
    server.use(
      http.post(`${ORIGIN}/v1/orgs/:id/api-keys`, async () => {
        await gate
        return HttpResponse.json({ ...key({ id: 'k3' }), key: FULL }, { status: 201 })
      }),
    )
    await user.click(await screen.findByRole('button', { name: 'Create API key' }))
    await user.type(screen.getByLabelText('Name'), 'CI key')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create key' }))
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled()
    release()
    expect(await screen.findByDisplayValue(FULL)).toBeInTheDocument()
  })

  it('requires a name', async () => {
    const user = userEvent.setup()
    const { posts } = setup([])
    await user.click(await screen.findByRole('button', { name: 'Create API key' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create key' }))
    expect(await screen.findByText('Enter a name for the key.')).toBeInTheDocument()
    expect(posts).toHaveLength(0)
  })

  it('too_many_keys shows friendly copy', async () => {
    const user = userEvent.setup()
    setup([])
    server.use(
      http.post(`${ORIGIN}/v1/orgs/:id/api-keys`, () =>
        HttpResponse.json({ error: { code: 'too_many_keys', message: 'raw' } }, { status: 409 }),
      ),
    )
    await user.click(await screen.findByRole('button', { name: 'Create API key' }))
    await user.type(screen.getByLabelText('Name'), 'x')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create key' }))
    expect(await screen.findByText(/maximum number of API keys/)).toBeInTheDocument()
  })

  it('revoke requires confirm and marks the key revoked', async () => {
    const user = userEvent.setup()
    const { deletes } = setup([key()])
    await user.click(await screen.findByRole('button', { name: 'Revoke Server key' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/stop working immediately/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(deletes).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Revoke Server key' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke key' }))
    const row = await screen.findByRole('row', { name: /Server key/ })
    expect(await within(row).findByText('Revoked')).toBeInTheDocument()
    expect(deletes).toEqual(['k1'])
  })
})
