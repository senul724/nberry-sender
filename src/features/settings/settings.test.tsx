import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Org } from '../../api/schemas'
import { ORIGIN, orgHandlers, testMe, testOrg } from '../../test/handlers'
import { renderApp } from '../../test/render'
import { server } from '../../test/server'

function setup(org: Org = testOrg()) {
  const patches: Record<string, unknown>[] = []
  const orgs = [org]
  server.use(
    ...orgHandlers(orgs),
    http.patch(`${ORIGIN}/v1/orgs/:id`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      patches.push(body)
      Object.assign(orgs[0], body)
      return HttpResponse.json(orgs[0])
    }),
  )
  return { patches, orgs, ...renderApp({ route: '/orgs/o1/settings', session: testMe }) }
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = 'nb_csrf=; max-age=0; path=/'
})

describe('settings details', () => {
  it('PATCH sends only the changed fields', async () => {
    const user = userEvent.setup()
    const { patches } = setup(testOrg({ description: 'Beans', website: 'https://acme.test' }))
    const name = await screen.findByLabelText('Name')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await user.clear(name)
    await user.type(name, 'Acme Roasters')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(patches).toEqual([{ name: 'Acme Roasters' }])
  })

  it('saving refreshes the org list and that org only, not the rest of its cache tree', async () => {
    const user = userEvent.setup()
    const { queryClient } = setup()
    queryClient.setQueryData(['orgs', 'o1', 'messages'], { messages: [] })
    const name = await screen.findByLabelText('Name')
    await user.type(name, ' Two')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Saved')
    expect(queryClient.getQueryState(['orgs', 'o1', 'messages'])?.isInvalidated).toBe(false)
  })

  it('trims text values before comparing and sending', async () => {
    const user = userEvent.setup()
    const { patches } = setup(testOrg({ description: 'Beans' }))
    const name = await screen.findByLabelText('Name')
    await user.type(name, '  ')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await user.clear(screen.getByLabelText('Description'))
    await user.type(screen.getByLabelText('Description'), '  Fresh beans  ')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Saved')
    expect(patches).toEqual([{ description: 'Fresh beans' }])
  })

  it('clearing the callback URL sends an empty string', async () => {
    const user = userEvent.setup()
    const { patches } = setup(testOrg({ callback_url: 'https://acme.test/hook' }))
    await user.clear(await screen.findByLabelText('Callback URL'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Saved')
    expect(patches).toEqual([{ callback_url: '' }])
  })

  it('requires a name and shows server errors', async () => {
    const user = userEvent.setup()
    const { patches } = setup()
    server.use(
      http.patch(`${ORIGIN}/v1/orgs/:id`, () =>
        HttpResponse.json(
          { error: { code: 'invalid_callback_url', message: 'x' } },
          { status: 400 },
        ),
      ),
    )
    await user.clear(await screen.findByLabelText('Name'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Enter a name.')).toBeInTheDocument()
    expect(patches).toHaveLength(0)
    await user.type(screen.getByLabelText('Name'), 'Z')
    await user.type(screen.getByLabelText('Callback URL'), 'http://nope')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/callback URL is not valid/)).toBeInTheDocument()
  })
})

describe('settings logo', () => {
  const png = (size = 10) => new File([new Uint8Array(size)], 'logo.png', { type: 'image/png' })

  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 256, height: 256, close: () => undefined })),
    )
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
  })

  it('rejects a gif and a file over 1 MiB client-side', async () => {
    const user = userEvent.setup({ applyAccept: false })
    setup()
    const input = await screen.findByLabelText('Logo file')
    await user.upload(input, new File([new Uint8Array(10)], 'a.gif', { type: 'image/gif' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Use a PNG, JPEG or WebP image.')
    expect(screen.queryByRole('button', { name: 'Upload logo' })).not.toBeInTheDocument()
    await user.upload(input, png((1 << 20) + 1))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('too large'))
    expect(screen.queryByRole('button', { name: 'Upload logo' })).not.toBeInTheDocument()
  })

  it('rejects images smaller than 64 px or larger than 2048 px', async () => {
    const user = userEvent.setup()
    setup()
    const input = await screen.findByLabelText('Logo file')
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 32, height: 200, close: () => undefined })),
    )
    await user.upload(input, png())
    expect(await screen.findByRole('alert')).toHaveTextContent('32 × 200')
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 3000, height: 200, close: () => undefined })),
    )
    await user.upload(input, png())
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('3000 × 200'))
    expect(screen.queryByRole('button', { name: 'Upload logo' })).not.toBeInTheDocument()
  })

  it('previews, then uploads the raw png with its Content-Type and X-CSRF-Token', async () => {
    document.cookie = 'nb_csrf=tok-1; path=/'
    const user = userEvent.setup()
    const seen: { type: string | null; csrf: string | null; size: number }[] = []
    const { orgs } = setup()
    server.use(
      http.put(`${ORIGIN}/v1/orgs/:id/logo`, async ({ request }) => {
        seen.push({
          type: request.headers.get('content-type'),
          csrf: request.headers.get('x-csrf-token'),
          size: (await request.arrayBuffer()).byteLength,
        })
        orgs[0].logo_url = 'https://cdn.example/new.png'
        return HttpResponse.json(orgs[0])
      }),
    )
    await user.upload(await screen.findByLabelText('Logo file'), png(10))
    expect(await screen.findByRole('img', { name: 'Logo preview' })).toHaveAttribute(
      'src',
      'blob:preview',
    )
    await user.click(screen.getByRole('button', { name: 'Upload logo' }))
    expect(await screen.findByRole('img', { name: 'Current logo' })).toHaveAttribute(
      'src',
      'https://cdn.example/new.png',
    )
    expect(seen).toEqual([{ type: 'image/png', csrf: 'tok-1', size: 10 }])
  })

  it.each([
    ['invalid_image', 400, /could not be used/],
    ['too_large', 413, /too large/],
    ['storage_not_configured', 501, /storage is not set up/],
  ])('server %s shows friendly copy', async (code, status, copy) => {
    const user = userEvent.setup()
    setup()
    server.use(
      http.put(`${ORIGIN}/v1/orgs/:id/logo`, () =>
        HttpResponse.json({ error: { code, message: 'raw' } }, { status }),
      ),
    )
    await user.upload(await screen.findByLabelText('Logo file'), png())
    await user.click(await screen.findByRole('button', { name: 'Upload logo' }))
    expect(await screen.findByText(copy)).toBeInTheDocument()
  })

  it('removes the logo', async () => {
    const user = userEvent.setup()
    const { orgs } = setup(testOrg({ logo_url: 'https://cdn.example/l.png' }))
    server.use(
      http.delete(`${ORIGIN}/v1/orgs/:id/logo`, () => {
        orgs[0].logo_url = null
        return HttpResponse.json(orgs[0])
      }),
    )
    await user.click(await screen.findByRole('button', { name: 'Remove logo' }))
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Current logo' })).toBeNull())
  })
})

describe('callback secret', () => {
  const SECRET = 'whsec_super_secret_value'

  function secretSetup() {
    let current = SECRET
    let posts = 0
    const ctx = setup()
    server.use(
      http.get(`${ORIGIN}/v1/orgs/:id/callback-secret`, () =>
        HttpResponse.json({ callback_secret: current }),
      ),
      http.post(`${ORIGIN}/v1/orgs/:id/callback-secret`, () => {
        posts++
        current = 'whsec_rotated'
        return HttpResponse.json({ callback_secret: current })
      }),
    )
    return { ...ctx, posts: () => posts }
  }

  it('is not in the QueryClient cache after reveal and is gone after hide', async () => {
    const user = userEvent.setup()
    const { queryClient } = secretSetup()
    expect(screen.queryByLabelText('Callback secret')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Reveal secret' }))
    expect(await screen.findByLabelText('Callback secret')).toHaveValue(SECRET)
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
    expect(dump()).not.toContain(SECRET)
    await user.click(screen.getByRole('button', { name: 'Hide secret' }))
    expect(screen.queryByLabelText('Callback secret')).not.toBeInTheDocument()
    expect(dump()).not.toContain(SECRET)
  })

  it('is dropped when the page unmounts', async () => {
    const user = userEvent.setup()
    const { router } = secretSetup()
    await user.click(await screen.findByRole('button', { name: 'Reveal secret' }))
    await screen.findByLabelText('Callback secret')
    await user.click(screen.getByRole('link', { name: 'Overview' }))
    await screen.findByRole('heading', { name: 'Overview' })
    await router.navigate('/orgs/o1/settings')
    await screen.findByRole('button', { name: 'Reveal secret' })
    expect(screen.queryByLabelText('Callback secret')).not.toBeInTheDocument()
  })

  it('rotate requires confirm, warns, then shows the new secret', async () => {
    const user = userEvent.setup()
    const { posts } = secretSetup()
    await user.click(await screen.findByRole('button', { name: 'Rotate secret' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/server must be updated/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(posts()).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Rotate secret' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Rotate secret' }),
    )
    expect(await screen.findByDisplayValue('whsec_rotated')).toBeInTheDocument()
    expect(posts()).toBe(1)
  })

  it('shows a reveal error', async () => {
    const user = userEvent.setup()
    setup()
    server.use(
      http.get(`${ORIGIN}/v1/orgs/:id/callback-secret`, () =>
        HttpResponse.json(
          { error: { code: 'forbidden', message: 'Not allowed' } },
          { status: 403 },
        ),
      ),
    )
    await user.click(await screen.findByRole('button', { name: 'Reveal secret' }))
    expect(await screen.findByText("You don't have permission to do that.")).toBeInTheDocument()
  })
})

describe('roles', () => {
  it('developer sees API keys but not Settings', async () => {
    server.use(...orgHandlers([testOrg({ my_role: 'developer' })]))
    renderApp({ route: '/orgs/o1/api-keys', session: testMe })
    expect(await screen.findByRole('heading', { name: 'API keys' })).toBeInTheDocument()
    const nav = within(screen.getByRole('navigation', { name: 'Main' }))
    expect(nav.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('developer opening /settings gets the no-access state', async () => {
    server.use(...orgHandlers([testOrg({ my_role: 'developer' })]))
    renderApp({ route: '/orgs/o1/settings', session: testMe })
    expect(await screen.findByText(/don't have access/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  })
})
