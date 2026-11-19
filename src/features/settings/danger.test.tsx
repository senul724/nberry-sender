import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { ORIGIN, orgHandlers, testMe, testOrg } from '../../test/handlers'
import { renderApp } from '../../test/render'
import { server } from '../../test/server'

function setup() {
  const orgs = [testOrg()]
  const bodies: unknown[] = []
  server.use(
    ...orgHandlers(orgs),
    http.delete(`${ORIGIN}/v1/orgs/:id`, async ({ request }) => {
      bodies.push(await request.json())
      orgs.length = 0
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return { bodies, ...renderApp({ route: '/orgs/o1/settings/danger', session: testMe }) }
}

describe('danger zone', () => {
  it('delete stays disabled until the exact name is typed and sends confirm_name', async () => {
    const user = userEvent.setup()
    const { bodies, router, queryClient } = setup()
    const input = await screen.findByLabelText(/Type .*Acme Coffee.* to confirm/)
    const button = screen.getByRole('button', { name: 'Delete sender' })
    expect(button).toBeDisabled()
    await user.type(input, 'acme coffee')
    expect(button).toBeDisabled()
    await user.clear(input)
    await user.type(input, 'Acme Coffee')
    expect(button).toBeEnabled()
    await user.click(button)
    expect(await screen.findByText('Create your first sender')).toBeInTheDocument()
    expect(bodies).toEqual([{ confirm_name: 'Acme Coffee' }])
    expect(router.state.location.pathname).toBe('/')
    expect(queryClient.getQueryData(['orgs', 'o1'])).toBeUndefined()
  })

  it('confirm_mismatch shows copy', async () => {
    const user = userEvent.setup()
    setup()
    server.use(
      http.delete(`${ORIGIN}/v1/orgs/:id`, () =>
        HttpResponse.json({ error: { code: 'confirm_mismatch', message: 'x' } }, { status: 400 }),
      ),
    )
    await user.type(await screen.findByLabelText(/to confirm/), 'Acme Coffee')
    await user.click(screen.getByRole('button', { name: 'Delete sender' }))
    expect(await screen.findByText("That name doesn't match.")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete sender' })).toBeEnabled())
  })

  it('non-owner sees no access', async () => {
    server.use(...orgHandlers([testOrg({ my_role: 'admin' })]))
    renderApp({ route: '/orgs/o1/settings/danger', session: testMe })
    expect(await screen.findByText(/don't have access/)).toBeInTheDocument()
  })
})
