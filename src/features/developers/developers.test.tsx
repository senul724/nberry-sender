import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { orgHandlers, testMe, testOrg } from '../../test/handlers'
import { renderApp } from '../../test/render'
import { server } from '../../test/server'

const cfg = vi.hoisted(() => ({ apiBaseUrl: '' }))
vi.mock('../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config')>()
  return {
    config: new Proxy(actual.config, {
      get: (t, k) => (k === 'apiBaseUrl' ? cfg.apiBaseUrl : Reflect.get(t, k)),
    }),
  }
})

describe('developers page', () => {
  it('uses the configured API base URL in the examples when one is set', async () => {
    cfg.apiBaseUrl = 'https://api.nberry.test'
    try {
      // The client now targets the configured API host, so match any origin.
      server.use(
        http.get('*/v1/me', () => HttpResponse.json(testMe)),
        http.get('*/v1/orgs', () => HttpResponse.json({ orgs: [testOrg()] })),
        http.get('*/v1/orgs/o1', () => HttpResponse.json(testOrg())),
      )
      renderApp({ route: '/orgs/o1/developers' })
      await screen.findByRole('heading', { name: 'Developers', level: 1 })
      const text = document.body.textContent ?? ''
      expect(text).toContain('https://api.nberry.test/v1/send/broadcasts')
    } finally {
      cfg.apiBaseUrl = ''
    }
  })

  it('contains every /v1/send endpoint path from the spec and no real-looking key', async () => {
    server.use(...orgHandlers([testOrg()]))
    renderApp({ route: '/orgs/o1/developers', session: testMe })
    await screen.findByRole('heading', { name: 'Developers', level: 1 })
    const text = document.body.textContent ?? ''
    for (const path of [
      'POST /v1/send/broadcasts',
      'POST /v1/send/invites',
      'GET /v1/send/invites/{invite_id}',
      'POST /v1/send/messages',
      'GET /v1/send/messages/{id}',
      'GET /v1/send/broadcasts/{id}',
      'GET /v1/send/links?customer_ref=',
      'DELETE /v1/send/links/{recipient_id}',
    ]) {
      expect(text).toContain(path)
    }
    expect(text).toContain(window.location.origin)
    expect(text).toContain('nb_live_…')
    expect(text).not.toMatch(/nb_(live|test)_[A-Za-z0-9]{6,}/)
    expect(text).toContain('nBerry-Signature')
    expect(text).toContain('nBerry-Event-Id')
    expect(text).toContain('timingSafeEqual')
    expect(text).toContain('~23 hours')
  })

  it('copies a code block', async () => {
    const user = userEvent.setup()
    server.use(...orgHandlers([testOrg()]))
    renderApp({ route: '/orgs/o1/developers', session: testMe })
    await screen.findByRole('heading', { name: 'Developers', level: 1 })
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    const buttons = screen.getAllByRole('button', { name: /^Copy / })
    await user.click(buttons[0])
    expect(writeText).toHaveBeenCalledOnce()
    expect(String(writeText.mock.calls[0][0])).toContain('Authorization: Bearer nb_live_…')
    writeText.mockRestore()
  })
})
