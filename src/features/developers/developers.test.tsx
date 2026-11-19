import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { orgHandlers, testMe, testOrg } from '../../test/handlers'
import { renderApp } from '../../test/render'
import { server } from '../../test/server'

describe('developers page', () => {
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
