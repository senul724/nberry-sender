import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { Link } from '../../api/schemas'
import { ORIGIN, orgHandlers, testMe, testOrg } from '../../test/handlers'
import { renderApp } from '../../test/render'
import { server } from '../../test/server'

const link = (over: Partial<Link>): Link => ({
  recipient_id: 'r1',
  customer_ref: 'cust-1',
  status: 'active',
  created_at: '2026-11-02T00:00:00Z',
  revoked_at: null,
  callback_failed_at: null,
  ...over,
})

describe('customers', () => {
  it('callback_failed filter sends the query param and failed rows are highlighted', async () => {
    const user = userEvent.setup()
    const urls: URL[] = []
    server.use(
      ...orgHandlers([testOrg()]),
      http.get(`${ORIGIN}/v1/orgs/:id/links`, ({ request }) => {
        const url = new URL(request.url)
        urls.push(url)
        const failedOnly = url.searchParams.get('callback_failed') === 'true'
        const all = [
          link({}),
          link({
            recipient_id: 'r2',
            customer_ref: 'cust-2',
            callback_failed_at: '2026-11-03T00:00:00Z',
          }),
        ]
        return HttpResponse.json({
          links: failedOnly ? all.filter((l) => l.callback_failed_at) : all,
          next_cursor: null,
        })
      }),
    )
    renderApp({ route: '/orgs/o1/customers', session: testMe })
    const failedRow = (await screen.findByText('cust-2')).closest('tr')
    const okRow = screen.getByText('cust-1').closest('tr')
    expect(failedRow).toHaveClass('bg-amber-50')
    expect(okRow).not.toHaveClass('bg-amber-50')
    expect(within(failedRow as HTMLElement).getByText('Callback failed')).toBeInTheDocument()
    expect(screen.getByText(/Your server can recover these with/)).toHaveTextContent(
      'GET /v1/send/links?customer_ref=',
    )
    expect(urls[0]?.searchParams.has('callback_failed')).toBe(false)

    await user.selectOptions(screen.getByLabelText('Show'), 'failed')
    await screen.findByText('cust-2')
    expect(screen.queryByText('cust-1')).not.toBeInTheDocument()
    expect(urls.at(-1)?.searchParams.get('callback_failed')).toBe('true')
  })

  it('loads more with the cursor', async () => {
    const user = userEvent.setup()
    const cursors: (string | null)[] = []
    server.use(
      ...orgHandlers([testOrg()]),
      http.get(`${ORIGIN}/v1/orgs/:id/links`, ({ request }) => {
        const c = new URL(request.url).searchParams.get('cursor')
        cursors.push(c)
        return c
          ? HttpResponse.json({
              links: [link({ recipient_id: 'r2', customer_ref: 'cust-2' })],
              next_cursor: null,
            })
          : HttpResponse.json({ links: [link({})], next_cursor: 'c1' })
      }),
    )
    renderApp({ route: '/orgs/o1/customers', session: testMe })
    await user.click(await screen.findByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('cust-2')).toBeInTheDocument()
    expect(cursors).toEqual([null, 'c1'])
  })

  it('shows empty and error states', async () => {
    server.use(
      ...orgHandlers([testOrg()]),
      http.get(`${ORIGIN}/v1/orgs/:id/links`, () =>
        HttpResponse.json({ links: [], next_cursor: null }),
      ),
    )
    renderApp({ route: '/orgs/o1/customers', session: testMe })
    expect(await screen.findByText('No linked customers')).toBeInTheDocument()
  })
})
