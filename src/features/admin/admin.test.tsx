import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { ORIGIN, testMe, testOrg as baseOrg } from '../../test/handlers'
import { renderApp } from '../../test/render'
import { server } from '../../test/server'

/** Admin endpoints return an Org without `my_role` (the backend omits it). */
function testOrg(overrides: Parameters<typeof baseOrg>[0] = {}) {
  const { my_role: _omitted, ...org } = baseOrg(overrides)
  return org
}

const admin = { ...testMe, is_admin: true }

describe('admin', () => {
  it('admin route is no-access for non-admins', async () => {
    renderApp({ route: '/admin', session: testMe })
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument()
    expect(screen.queryByLabelText('Organization ID')).not.toBeInTheDocument()
  })

  it('sets status and shows the updated org', async () => {
    const user = userEvent.setup()
    const calls: { url: string; body: unknown }[] = []
    server.use(
      http.put(`${ORIGIN}/v1/admin/orgs/:id/status`, async ({ request }) => {
        calls.push({ url: request.url, body: await request.json() })
        return HttpResponse.json(testOrg({ status: 'suspended' }))
      }),
    )
    renderApp({ route: '/admin', session: admin })
    await user.type(await screen.findByLabelText('Organization ID'), 'o1')
    await user.selectOptions(screen.getByLabelText('Status'), 'suspended')
    await user.click(screen.getByRole('button', { name: 'Update status' }))
    expect(await screen.findByText('Acme Coffee')).toBeInTheDocument()
    expect(calls).toEqual([
      { url: `${ORIGIN}/v1/admin/orgs/o1/status`, body: { status: 'suspended' } },
    ])
    expect(await screen.findByText(/Status: suspended/)).toBeInTheDocument()
  })

  it('send-rate rejects 0 and 1001 client-side and PUTs a valid value', async () => {
    const user = userEvent.setup()
    const bodies: unknown[] = []
    server.use(
      http.put(`${ORIGIN}/v1/admin/orgs/:id/send-rate`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(testOrg({ send_rate_per_sec: 25 }))
      }),
    )
    renderApp({ route: '/admin', session: admin })
    await user.type(await screen.findByLabelText('Organization ID'), 'o1')
    const rate = screen.getByLabelText('Send rate per second')
    const button = screen.getByRole('button', { name: 'Update send rate' })
    await user.type(rate, '0')
    await user.click(button)
    expect(await screen.findByText('Enter a whole number from 1 to 1000.')).toBeInTheDocument()
    await user.clear(rate)
    await user.type(rate, '1001')
    await user.click(button)
    expect(screen.getByText('Enter a whole number from 1 to 1000.')).toBeInTheDocument()
    expect(bodies).toEqual([])
    await user.clear(rate)
    await user.type(rate, '25')
    await user.click(button)
    await waitFor(() => expect(bodies).toEqual([{ send_rate_per_sec: 25 }]))
    expect(await screen.findByText(/Send rate: 25 per second/)).toBeInTheDocument()
  })
})
