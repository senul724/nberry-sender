import { http, HttpResponse, type RequestHandler } from 'msw'
import type { Me } from '../api/schemas'

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
