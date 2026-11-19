import { http, HttpResponse, type RequestHandler } from 'msw'
import type { ApiKey, Me, Org, Stats } from '../api/schemas'

// Default handlers shared by tests; later tasks add API shapes here.
export const handlers: RequestHandler[] = []

/** jsdom's origin; the client builds relative URLs against it. */
export const ORIGIN = 'http://localhost:3000'

export const testMe: Me = {
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  mfa_enabled: false,
  has_password: true,
  is_admin: false,
  created_at: '2026-11-01T00:00:00Z',
}

export const testTokens = {
  session_id: 's1',
  access_expires_at: '2026-11-19T10:15:00Z',
  csrf_token: 'csrf-1',
}

export const unauthorized = () =>
  HttpResponse.json({ error: { code: 'unauthorized', message: 'expired' } }, { status: 401 })

/** `GET /v1/me` for a signed-in user, or 401 (and a failing refresh) when `session` is null. */
export function sessionHandlers(session: Me | null): RequestHandler[] {
  if (session) return [http.get(`${ORIGIN}/v1/me`, () => HttpResponse.json(session))]
  return [
    http.get(`${ORIGIN}/v1/me`, unauthorized),
    http.post(`${ORIGIN}/v1/auth/refresh`, () =>
      HttpResponse.json(
        { error: { code: 'invalid_refresh_token', message: 'nope' } },
        { status: 401 },
      ),
    ),
  ]
}

export const testOrg = (overrides: Partial<Org> = {}): Org => ({
  id: 'o1',
  name: 'Acme Coffee',
  description: null,
  website: null,
  logo_url: null,
  status: 'verified',
  broadcast_code: 'abc123',
  callback_url: null,
  send_rate_per_sec: 10,
  my_role: 'owner',
  created_at: '2026-11-01T00:00:00Z',
  ...overrides,
})

export const testStats: Stats = {
  subscriber_count: 1234,
  messages_queued: 2,
  messages_sent: 56,
  messages_failed: 7,
  links_active: 89,
}

export const forbidden = () =>
  HttpResponse.json({ error: { code: 'forbidden', message: 'no' } }, { status: 403 })

export const orgNotFound = () =>
  HttpResponse.json({ error: { code: 'not_found', message: 'nope' } }, { status: 404 })

/**
 * Org endpoints for a list of orgs. The array is read on every request, so a test can push a
 * newly created org into it. `apiKeys` may be `'forbidden'` to make the key list return 403.
 */
export function orgHandlers(
  orgs: Org[],
  extra: { stats?: Stats; apiKeys?: ApiKey[] | 'forbidden' } = {},
): RequestHandler[] {
  return [
    http.get(`${ORIGIN}/v1/orgs`, () => HttpResponse.json({ orgs })),
    http.get(`${ORIGIN}/v1/orgs/:id`, ({ params }) => {
      const org = orgs.find((o) => o.id === params.id)
      return org ? HttpResponse.json(org) : orgNotFound()
    }),
    http.get(`${ORIGIN}/v1/orgs/:id/stats`, () => HttpResponse.json(extra.stats ?? testStats)),
    http.get(`${ORIGIN}/v1/orgs/:id/api-keys`, () =>
      extra.apiKeys === 'forbidden'
        ? forbidden()
        : HttpResponse.json({ api_keys: extra.apiKeys ?? [] }),
    ),
  ]
}
