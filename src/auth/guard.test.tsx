import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { ORIGIN, unauthorized } from '../test/handlers'
import { renderApp } from '../test/render'
import { server } from '../test/server'

describe('signed-out visitors', () => {
  it('a first-time visitor (no cookies) lands on /login?next=/ with zero refresh calls', async () => {
    let refreshCalls = 0
    server.use(
      http.get(`${ORIGIN}/v1/me`, unauthorized),
      http.post(`${ORIGIN}/v1/auth/refresh`, () => {
        refreshCalls++
        return HttpResponse.json(
          { error: { code: 'csrf_failed', message: 'csrf' } },
          { status: 403 },
        )
      }),
    )
    const { router } = renderApp({ route: '/' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe('?next=%2F')
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(refreshCalls).toBe(0)
  })

  it('a 403 csrf_failed from refresh is treated as session expiry', async () => {
    document.cookie = 'nb_csrf=stale; path=/'
    try {
      server.use(
        http.get(`${ORIGIN}/v1/me`, unauthorized),
        http.post(`${ORIGIN}/v1/auth/refresh`, () =>
          HttpResponse.json({ error: { code: 'csrf_failed', message: 'csrf' } }, { status: 403 }),
        ),
      )
      const { router } = renderApp({ route: '/account' })
      await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
      expect(router.state.location.search).toBe('?next=%2Faccount')
    } finally {
      document.cookie = 'nb_csrf=; max-age=0; path=/'
    }
  })
})
