import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { Message } from '../../api/schemas'
import { ORIGIN, orgHandlers, testMe, testOrg } from '../../test/handlers'
import { renderApp } from '../../test/render'
import { server } from '../../test/server'

const msg = (over: Partial<Message>): Message => ({
  id: 'x',
  kind: 'broadcast',
  title: 'T',
  body: 'B',
  status: 'sent',
  failure_reason: null,
  created_at: '2026-11-19T09:00:00Z',
  sent_at: '2026-11-19T09:01:00Z',
  source: 'api',
  sent_by: null,
  ...over,
})

function setup(pages: Record<string, { messages: Message[]; next_cursor: string | null }>) {
  const urls: URL[] = []
  server.use(
    ...orgHandlers([testOrg()]),
    http.get(`${ORIGIN}/v1/orgs/:id/messages`, ({ request }) => {
      const url = new URL(request.url)
      urls.push(url)
      return HttpResponse.json(pages[url.searchParams.get('cursor') ?? ''])
    }),
  )
  renderApp({ route: '/orgs/o1/messages', session: testMe })
  return urls
}

const rowFor = (title: string) => screen.getByRole('row', { name: new RegExp(title) })

describe('messages table', () => {
  it('"Sent from": API, a named sender, "A team member" for an empty name, and for null sent_by', async () => {
    setup({
      '': {
        messages: [
          msg({ id: '1', title: 'From API', source: 'api' }),
          msg({
            id: '2',
            title: 'From Ada',
            source: 'dashboard',
            sent_by: { user_id: 'u1', name: 'Ada Lovelace' },
          }),
          msg({
            id: '3',
            title: 'Empty name',
            source: 'dashboard',
            sent_by: { user_id: 'u2', name: '' },
          }),
          msg({ id: '4', title: 'Deleted user', source: 'dashboard', sent_by: null }),
        ],
        next_cursor: null,
      },
    })
    await screen.findByText('From API')
    expect(within(rowFor('From API')).getByText('API')).toBeInTheDocument()
    expect(within(rowFor('From Ada')).getByText('Ada Lovelace')).toBeInTheDocument()
    expect(within(rowFor('Empty name')).getByText('A team member')).toBeInTheDocument()
    expect(within(rowFor('Deleted user')).getByText('A team member')).toBeInTheDocument()
  })

  it('Load more appends the next page and hides when next_cursor is null', async () => {
    const user = userEvent.setup()
    const urls = setup({
      '': { messages: [msg({ id: '1', title: 'First' })], next_cursor: 'c2' },
      c2: { messages: [msg({ id: '2', title: 'Second' })], next_cursor: null },
    })
    await screen.findByText('First')
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Second')).toBeInTheDocument()
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    expect(urls[1]?.searchParams.get('cursor')).toBe('c2')
  })

  it('filters loaded rows by kind and status, and shows the failure reason', async () => {
    const user = userEvent.setup()
    setup({
      '': {
        messages: [
          msg({ id: '1', title: 'Sent bc' }),
          msg({ id: '2', title: 'Failed bc', status: 'failed', failure_reason: 'no_subscribers' }),
          msg({ id: '3', title: 'Unicast one', kind: 'unicast' }),
        ],
        next_cursor: null,
      },
    })
    await screen.findByText('Sent bc')
    expect(screen.getByText('no_subscribers')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Kind'), 'unicast')
    expect(screen.queryByText('Sent bc')).not.toBeInTheDocument()
    expect(screen.getByText('Unicast one')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Kind'), '')
    await user.selectOptions(screen.getByLabelText('Status'), 'failed')
    expect(screen.getByText('Failed bc')).toBeInTheDocument()
    expect(screen.queryByText('Sent bc')).not.toBeInTheDocument()
  })

  it('shows an empty state when there are no messages', async () => {
    setup({ '': { messages: [], next_cursor: null } })
    expect(await screen.findByText('No messages yet')).toBeInTheDocument()
  })
})
