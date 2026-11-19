import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config } from '../../config'
import { ORIGIN, orgHandlers, testMe, testOrg } from '../../test/handlers'
import { renderApp } from '../../test/render'
import { server } from '../../test/server'

const { create, composePng } = vi.hoisted(() => ({ create: vi.fn(), composePng: vi.fn() }))

vi.mock('qrcode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('qrcode')>()
  create.mockImplementation(actual.create)
  return { ...actual, default: { ...actual, create } }
})
// jsdom has no canvas: the PNG composer is unit-tested separately with a fake canvas.
vi.mock('./exportQr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./exportQr')>()),
  composeQrPng: composePng,
}))

beforeEach(() => {
  create.mockClear()
  composePng.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
})
afterEach(() => vi.restoreAllMocks())

const link = (code: string) => `${config.linkBaseUrl}/s/${code}`

describe('QR page', () => {
  it('encodes ${LINK_BASE}/s/${code} with error correction H and shows the link', async () => {
    server.use(...orgHandlers([testOrg({ broadcast_code: 'abc123' })]))
    renderApp({ route: '/orgs/o1/qr', session: testMe })
    expect(await screen.findByLabelText('Follow link')).toHaveValue(link('abc123'))
    expect(create).toHaveBeenCalledWith(
      link('abc123'),
      expect.objectContaining({ errorCorrectionLevel: 'H' }),
    )
    expect(screen.getByRole('img', { name: /QR code/ })).toBeInTheDocument()
  })

  it('developers do not see Regenerate code (owner and admin only)', async () => {
    server.use(...orgHandlers([testOrg({ my_role: 'developer' })]))
    renderApp({ route: '/orgs/o1/qr', session: testMe })
    await screen.findByLabelText('Follow link')
    expect(screen.queryByRole('button', { name: 'Regenerate code' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download PNG' })).toBeInTheDocument()
  })

  it('admins can regenerate', async () => {
    server.use(...orgHandlers([testOrg({ my_role: 'admin' })]))
    renderApp({ route: '/orgs/o1/qr', session: testMe })
    expect(await screen.findByRole('button', { name: 'Regenerate code' })).toBeInTheDocument()
  })

  it('regenerate requires confirm and updates the shown code', async () => {
    const user = userEvent.setup()
    let posts = 0
    const orgs = [testOrg({ broadcast_code: 'abc123' })]
    server.use(
      ...orgHandlers(orgs),
      http.post(`${ORIGIN}/v1/orgs/:id/broadcast-code`, () => {
        posts++
        orgs[0] = testOrg({ broadcast_code: 'new999' })
        return HttpResponse.json(orgs[0])
      }),
    )
    renderApp({ route: '/orgs/o1/qr', session: testMe })
    await screen.findByLabelText('Follow link')

    await user.click(screen.getByRole('button', { name: 'Regenerate code' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/old printed codes stop working/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/subscribers stay/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(posts).toBe(0)
    expect(screen.getByLabelText('Follow link')).toHaveValue(link('abc123'))

    await user.click(screen.getByRole('button', { name: 'Regenerate code' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Regenerate code' }),
    )
    expect(await screen.findByDisplayValue(link('new999'))).toBeInTheDocument()
    expect(posts).toBe(1)
  })

  it('a regenerate error is shown and the code is unchanged', async () => {
    const user = userEvent.setup()
    server.use(
      ...orgHandlers([testOrg()]),
      http.post(`${ORIGIN}/v1/orgs/:id/broadcast-code`, () =>
        HttpResponse.json({ error: { code: 'forbidden', message: 'No way' } }, { status: 403 }),
      ),
    )
    renderApp({ route: '/orgs/o1/qr', session: testMe })
    await screen.findByLabelText('Follow link')
    await user.click(screen.getByRole('button', { name: 'Regenerate code' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Regenerate code' }),
    )
    expect(await screen.findByText('No way')).toBeInTheDocument()
    expect(screen.getByLabelText('Follow link')).toHaveValue(link('abc123'))
  })

  it('downloads a PNG and says so when the logo had to be left out', async () => {
    const user = userEvent.setup()
    composePng.mockResolvedValue({ blob: new Blob(['x']), withLogo: false })
    server.use(...orgHandlers([testOrg({ logo_url: 'https://cdn.example/l.png' })]))
    renderApp({ route: '/orgs/o1/qr', session: testMe })
    await screen.findByLabelText('Follow link')
    await user.click(screen.getByRole('button', { name: 'Download PNG' }))
    expect(composePng).toHaveBeenCalledWith(
      expect.objectContaining({ size: expect.any(Number) }),
      'https://cdn.example/l.png',
    )
    expect(await screen.findByText(/saved without the logo/i)).toBeInTheDocument()
  })

  it('downloads an SVG that references the logo and encodes the QR', async () => {
    const user = userEvent.setup()
    let svg = ''
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      void (b as Blob).text().then((t) => (svg = t))
      return 'blob:svg'
    })
    server.use(...orgHandlers([testOrg({ logo_url: 'https://cdn.example/l.png' })]))
    renderApp({ route: '/orgs/o1/qr', session: testMe })
    await screen.findByLabelText('Follow link')
    await user.click(screen.getByRole('button', { name: 'Download SVG' }))
    await vi.waitFor(() => expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"'))
    expect(svg).toContain('href="https://cdn.example/l.png"')
  })

  it('"Print poster" prints a layout with the org name, QR and call to action', async () => {
    const user = userEvent.setup()
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    server.use(...orgHandlers([testOrg({ name: 'Acme Coffee' })]))
    renderApp({ route: '/orgs/o1/qr', session: testMe })
    await screen.findByLabelText('Follow link')
    const poster = screen.getByRole('region', { name: 'Poster for printing' })
    expect(within(poster).getByText('Acme Coffee')).toBeInTheDocument()
    expect(within(poster).getByText('Scan with nBerry to follow')).toBeInTheDocument()
    expect(within(poster).getByRole('img', { name: /Scan code on the poster/ })).toBeInTheDocument()
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Print poster' }))
    })
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('print CSS (A5, poster only) applies only while the QR page is mounted', async () => {
    const user = userEvent.setup()
    server.use(...orgHandlers([testOrg()]))
    renderApp({ route: '/orgs/o1/qr', session: testMe })
    await screen.findByLabelText('Follow link')
    const printCss = () =>
      [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n')
    expect(printCss()).toContain('size: A5')
    expect(printCss()).toContain('.print-poster')
    await user.click(screen.getByRole('link', { name: 'Compose' }))
    await screen.findByRole('heading', { name: 'Compose' })
    expect(printCss()).not.toContain('size: A5')
    expect(printCss()).not.toContain('.print-poster')
  })

  it('resets the "saved without the logo" note when the logo changes', async () => {
    const user = userEvent.setup()
    composePng.mockResolvedValue({ blob: new Blob(['x']), withLogo: false })
    const orgs = [testOrg({ logo_url: 'https://cdn.example/l.png' })]
    server.use(...orgHandlers(orgs))
    const { queryClient } = renderApp({ route: '/orgs/o1/qr', session: testMe })
    await screen.findByLabelText('Follow link')
    await user.click(screen.getByRole('button', { name: 'Download PNG' }))
    await screen.findByText(/saved without the logo/i)
    orgs[0] = testOrg({ logo_url: null })
    act(() => queryClient.setQueryData(['orgs', 'o1'], orgs[0]))
    await vi.waitFor(() =>
      expect(screen.queryByText(/saved without the logo/i)).not.toBeInTheDocument(),
    )
  })
})
