import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { server } from '../test/server'
import { Org, Me } from './schemas'

type Client = typeof import('./client')
let client: Client
let ApiError: typeof import('./errors').ApiError
let friendlyMessage: typeof import('./errors').friendlyMessage

const tokens = { session_id: 's1', access_expires_at: '2026-11-19T10:15:00Z', csrf_token: 'fresh' }
const Ok = z.object({ ok: z.boolean() })

function setCsrfCookie(value: string | null) {
  document.cookie = value === null ? 'nb_csrf=; max-age=0; path=/' : `nb_csrf=${value}; path=/`
}

beforeEach(async () => {
  setCsrfCookie(null)
  vi.resetModules() // fresh module state (remembered csrf, in-flight refresh) per test
  client = await import('./client')
  ;({ ApiError, friendlyMessage } = await import('./errors'))
})

describe('request basics', () => {
  it('sends X-CSRF-Token from the nb_csrf cookie on POST/PATCH/PUT/DELETE and not on GET', async () => {
    setCsrfCookie('cookie-token')
    const seen: Record<string, string | null> = {}
    server.use(
      http.all('http://localhost:3000/v1/x', ({ request }) => {
        seen[request.method] = request.headers.get('x-csrf-token')
        return HttpResponse.json({ ok: true })
      }),
    )
    for (const m of ['get', 'post', 'patch', 'put', 'delete'] as const) {
      await client.api[m]('/v1/x', { schema: Ok })
    }
    expect(seen).toEqual({
      GET: null,
      POST: 'cookie-token',
      PATCH: 'cookie-token',
      PUT: 'cookie-token',
      DELETE: 'cookie-token',
    })
  })

  it('falls back to the remembered csrf_token when the cookie is absent', async () => {
    client.rememberCsrf('remembered')
    let header: string | null = null
    server.use(
      http.post('http://localhost:3000/v1/x', ({ request }) => {
        header = request.headers.get('x-csrf-token')
        return HttpResponse.json({ ok: true })
      }),
    )
    await client.api.post('/v1/x', { schema: Ok, body: {} })
    expect(header).toBe('remembered')
  })

  it('sends credentials include and application/json; the logo PUT sends the raw blob with its own type and CSRF', async () => {
    setCsrfCookie('c')
    const calls: {
      path: string
      type: string | null
      csrf: string | null
      size: number
      cred: string
    }[] = []
    server.use(
      http.all('http://localhost:3000/v1/*', async ({ request }) => {
        calls.push({
          path: new URL(request.url).pathname,
          type: request.headers.get('content-type'),
          csrf: request.headers.get('x-csrf-token'),
          size: (await request.arrayBuffer()).byteLength,
          cred: request.credentials,
        })
        return HttpResponse.json({ ok: true })
      }),
    )
    await client.api.post('/v1/json', { schema: Ok, body: { a: 1 } })
    await client.api.put('/v1/logo', {
      schema: Ok,
      rawBody: new Blob([new Uint8Array(10)], { type: 'image/png' }),
      contentType: 'image/png',
    })
    expect(calls[0]).toMatchObject({ type: 'application/json', csrf: 'c', cred: 'include' })
    expect(calls[1]).toMatchObject({ path: '/v1/logo', type: 'image/png', csrf: 'c', size: 10 })
  })

  it('resolves undefined for 204 with z.undefined()', async () => {
    server.use(
      http.delete('http://localhost:3000/v1/x', () => new HttpResponse(null, { status: 204 })),
    )
    await expect(client.api.delete('/v1/x', { schema: z.undefined() })).resolves.toBeUndefined()
  })
})

describe('refresh', () => {
  function expiredThenOk(counter: { refresh: number }, refreshHandler?: () => Response) {
    let fresh = false
    server.use(
      http.get('http://localhost:3000/v1/data', () =>
        fresh
          ? HttpResponse.json({ ok: true })
          : HttpResponse.json(
              { error: { code: 'unauthorized', message: 'expired' } },
              { status: 401 },
            ),
      ),
      http.post('http://localhost:3000/v1/auth/refresh', async () => {
        counter.refresh++
        await new Promise((r) => setTimeout(r, 30))
        if (refreshHandler) return refreshHandler()
        fresh = true
        return HttpResponse.json(tokens)
      }),
    )
  }

  it('parallel 401s trigger exactly one refresh, then each original request is retried once and resolves', async () => {
    const counter = { refresh: 0 }
    expiredThenOk(counter)
    const results = await Promise.all(
      Array.from({ length: 5 }, () => client.api.get('/v1/data', { schema: Ok })),
    )
    expect(results).toEqual(Array(5).fill({ ok: true }))
    expect(counter.refresh).toBe(1)
  })

  it('refresh body is {client:"web"} and carries X-CSRF-Token', async () => {
    setCsrfCookie('from-cookie')
    let body: unknown
    let csrf: string | null = null
    let fresh = false
    server.use(
      http.get('http://localhost:3000/v1/data', () =>
        fresh ? HttpResponse.json({ ok: true }) : new HttpResponse(null, { status: 401 }),
      ),
      http.post('http://localhost:3000/v1/auth/refresh', async ({ request }) => {
        body = await request.json()
        csrf = request.headers.get('x-csrf-token')
        fresh = true
        return HttpResponse.json(tokens)
      }),
    )
    await client.api.get('/v1/data', { schema: Ok })
    expect(body).toEqual({ client: 'web' })
    expect(csrf).toBe('from-cookie')
  })

  it('a later refresh can happen after the first settles (promise is cleared)', async () => {
    const counter = { refresh: 0 }
    let fresh = false
    server.use(
      http.get('http://localhost:3000/v1/data', () =>
        fresh ? HttpResponse.json({ ok: true }) : new HttpResponse(null, { status: 401 }),
      ),
      http.post('http://localhost:3000/v1/auth/refresh', () => {
        counter.refresh++
        fresh = true
        return HttpResponse.json(tokens)
      }),
    )
    await client.api.get('/v1/data', { schema: Ok })
    fresh = false
    await client.api.get('/v1/data', { schema: Ok })
    expect(counter.refresh).toBe(2)
  })

  it('409 refresh_race waits ~300ms and retries the original request without a second refresh', async () => {
    let refreshCalls = 0
    let dataCalls = 0
    server.use(
      http.get('http://localhost:3000/v1/data', () => {
        dataCalls++
        return dataCalls === 1
          ? new HttpResponse(null, { status: 401 })
          : HttpResponse.json({ ok: true })
      }),
      http.post('http://localhost:3000/v1/auth/refresh', () => {
        refreshCalls++
        return HttpResponse.json(
          { error: { code: 'refresh_race', message: 'race' } },
          { status: 409 },
        )
      }),
    )
    const start = performance.now()
    await expect(client.api.get('/v1/data', { schema: Ok })).resolves.toEqual({ ok: true })
    expect(performance.now() - start).toBeGreaterThanOrEqual(280)
    expect(refreshCalls).toBe(1)
    expect(dataCalls).toBe(2)
  })

  it.each(['invalid_refresh_token', 'refresh_reused'])(
    '%s from refresh calls the session-expired handler and rejects with ApiError',
    async (code) => {
      const onExpired = vi.fn()
      client.setSessionExpiredHandler(onExpired)
      server.use(
        http.get('http://localhost:3000/v1/data', () => new HttpResponse(null, { status: 401 })),
        http.post('http://localhost:3000/v1/auth/refresh', () =>
          HttpResponse.json({ error: { code, message: 'nope' } }, { status: 401 }),
        ),
      )
      const results = await Promise.allSettled([
        client.api.get('/v1/data', { schema: Ok }),
        client.api.get('/v1/data', { schema: Ok }),
      ])
      for (const r of results) {
        expect(r.status).toBe('rejected')
        expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ApiError)
        expect((r as PromiseRejectedResult).reason).toMatchObject({ status: 401, code })
      }
      expect(onExpired).toHaveBeenCalledTimes(1)
    },
  )

  it('a 5xx from refresh rejects but does not expire the session', async () => {
    const onExpired = vi.fn()
    client.setSessionExpiredHandler(onExpired)
    server.use(
      http.get('http://localhost:3000/v1/data', () => new HttpResponse(null, { status: 401 })),
      http.post('http://localhost:3000/v1/auth/refresh', () =>
        HttpResponse.json({ error: { code: 'internal', message: 'boom' } }, { status: 500 }),
      ),
    )
    await expect(client.api.get('/v1/data', { schema: Ok })).rejects.toMatchObject({ status: 500 })
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('a 401 from /v1/auth/* endpoints is not refreshed', async () => {
    let refreshCalls = 0
    server.use(
      http.post('http://localhost:3000/v1/auth/login', () =>
        HttpResponse.json(
          { error: { code: 'invalid_credentials', message: 'bad' } },
          { status: 401 },
        ),
      ),
      http.post('http://localhost:3000/v1/auth/refresh', () => {
        refreshCalls++
        return HttpResponse.json(tokens)
      }),
    )
    await expect(client.api.post('/v1/auth/login', { schema: Ok, body: {} })).rejects.toMatchObject(
      {
        status: 401,
        code: 'invalid_credentials',
      },
    )
    expect(refreshCalls).toBe(0)
  })

  it('a second 401 after a successful refresh is surfaced, not looped', async () => {
    let refreshCalls = 0
    server.use(
      http.get('http://localhost:3000/v1/data', () =>
        HttpResponse.json({ error: { code: 'unauthorized', message: 'x' } }, { status: 401 }),
      ),
      http.post('http://localhost:3000/v1/auth/refresh', () => {
        refreshCalls++
        return HttpResponse.json(tokens)
      }),
    )
    await expect(client.api.get('/v1/data', { schema: Ok })).rejects.toMatchObject({ status: 401 })
    expect(refreshCalls).toBe(1)
  })
})

describe('validation and errors', () => {
  it('a non-JSON or schema-mismatched response rejects with a clear error, never unvalidated data', async () => {
    server.use(
      http.get('http://localhost:3000/v1/html', () => new HttpResponse('<html>', { status: 200 })),
      http.get('http://localhost:3000/v1/me', () => HttpResponse.json({ id: 1 })),
    )
    await expect(client.api.get('/v1/html', { schema: Ok })).rejects.toMatchObject({
      code: 'invalid_response',
    })
    await expect(client.api.get('/v1/me', { schema: Me })).rejects.toMatchObject({
      code: 'invalid_response',
    })
    await expect(client.api.get('/v1/me', { schema: Org })).rejects.toBeInstanceOf(ApiError)
  })

  it('error envelopes become ApiError with status, code, message and body', async () => {
    const body = {
      error: { code: 'sole_owner', message: 'only owner' },
      orgs: [{ id: 'o', name: 'N' }],
    }
    server.use(
      http.delete('http://localhost:3000/v1/me', () => HttpResponse.json(body, { status: 409 })),
    )
    const err = await client.api
      .delete('/v1/me', { schema: z.undefined() })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 409, code: 'sole_owner', message: 'only owner', body })
  })
})

describe('friendlyMessage', () => {
  it('maps known codes and falls back to message', () => {
    expect(friendlyMessage(new ApiError(503, 'server_busy', 'x'))).toBe(
      'Busy, try again in a moment.',
    )
    expect(friendlyMessage(new ApiError(404, 'user_not_found', 'x'))).toBe(
      'Ask them to create an nBerry account first, then add them again.',
    )
    expect(friendlyMessage(new ApiError(400, 'something_new', 'Server says hi'))).toBe(
      'Server says hi',
    )
    expect(friendlyMessage(new Error('plain'))).toBe('plain')
    expect(friendlyMessage('weird')).toBe('Something went wrong. Please try again.')
  })
})
