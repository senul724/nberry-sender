import { z } from 'zod'
import { config } from '../config'
import { ApiError, errorEnvelope } from './errors'
import { TokensWeb } from './schemas'

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export interface RequestOptions<T> {
  /** Validates the response body. Use `z.undefined()` for 204 No Content responses. */
  schema: z.ZodType<T>
  /** JSON body (sent as application/json). */
  body?: unknown
  /** Raw body (logo upload); sent with `contentType` instead of JSON. */
  rawBody?: Blob
  contentType?: string
  signal?: AbortSignal
}

const REFRESH_PATH = '/v1/auth/refresh'
const RACE_WAIT_MS = 300

// --- CSRF -----------------------------------------------------------------

/** The only place cookies are read. */
function readCsrfCookie(): string | undefined {
  for (const part of document.cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === 'nb_csrf') {
      const raw = rest.join('=')
      try {
        return decodeURIComponent(raw)
      } catch {
        return raw // malformed percent-encoding: use the raw value
      }
    }
  }
  return undefined
}

let rememberedCsrf: string | undefined

/** Remember the latest `csrf_token` from a login/MFA/Google/refresh body (in memory only). */
export function rememberCsrf(token: string): void {
  rememberedCsrf = token
}

function csrfToken(): string | undefined {
  return readCsrfCookie() ?? rememberedCsrf
}

// --- session expiry ---------------------------------------------------------

let sessionExpired: () => void = () => {}

/** Register what happens when the session cannot be refreshed (clear caches, go to /login). */
export function setSessionExpiredHandler(fn: () => void): void {
  sessionExpired = fn
}

// --- transport ----------------------------------------------------------------

async function send(method: Method, path: string, opts: Omit<RequestOptions<unknown>, 'schema'>) {
  const headers = new Headers()
  let body: BodyInit | undefined
  if (opts.rawBody !== undefined) {
    body = opts.rawBody
    if (opts.contentType) headers.set('Content-Type', opts.contentType)
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body)
    headers.set('Content-Type', 'application/json')
  }
  if (method !== 'GET') {
    const csrf = csrfToken()
    if (csrf) headers.set('X-CSRF-Token', csrf)
  }
  try {
    return await fetch(config.apiBaseUrl + path, {
      method,
      headers,
      body,
      credentials: 'include',
      signal: opts.signal,
    })
  } catch {
    if (opts.signal?.aborted) throw opts.signal.reason
    throw new ApiError(0, 'network_error', 'Network request failed')
  }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = await readJson(res)
  const parsed = errorEnvelope.safeParse(body)
  if (parsed.success) {
    const { code, message } = parsed.data.error
    return new ApiError(res.status, code, message ?? '', body)
  }
  return new ApiError(res.status, 'unknown_error', `Request failed (${res.status})`, body)
}

async function parse<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
  if (res.status === 204) {
    const r = schema.safeParse(undefined)
    if (r.success) return r.data
    throw new ApiError(res.status, 'invalid_response', 'Unexpected response from the server')
  }
  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new ApiError(res.status, 'invalid_response', 'The server sent a non-JSON response')
  }
  const r = schema.safeParse(json)
  if (!r.success) {
    throw new ApiError(
      res.status,
      'invalid_response',
      'The server response had an unexpected shape',
    )
  }
  return r.data
}

// --- single-flight refresh ----------------------------------------------------------

let refreshing: Promise<void> | undefined
/** Bumped whenever a refresh settles with a definite outcome (success/race or session expiry). */
let refreshGeneration = 0
let lastRefreshOk = true

function settleRefresh(ok: boolean): void {
  refreshGeneration++
  lastRefreshOk = ok
}

/**
 * One refresh per tab: the backend rotates the refresh token on every use, so a second
 * concurrent refresh would present a used token and revoke the session.
 * Resolves when the original request may be retried (refresh succeeded, or another tab won
 * the race and we waited); rejects with an ApiError when the session is gone.
 */
function refreshSession(): Promise<void> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = undefined
  })
  return refreshing
}

function expireSession(): never {
  settleRefresh(false)
  sessionExpired()
  throw new ApiError(401, 'invalid_refresh_token', 'Your session has expired. Please sign in again.')
}

async function doRefresh(): Promise<void> {
  // The backend checks CSRF before it reads the refresh cookie, so with no CSRF value the
  // call can only fail (403 csrf_failed): a signed-out visitor, not a recoverable session.
  if (!csrfToken()) expireSession()
  const res = await send('POST', REFRESH_PATH, { body: { client: 'web' } })
  if (res.ok) {
    const tokens = await parse(res, TokensWeb)
    rememberCsrf(tokens.csrf_token)
    settleRefresh(true)
    return
  }
  const err = await toApiError(res)
  if (err.code === 'refresh_race') {
    await new Promise((resolve) => setTimeout(resolve, RACE_WAIT_MS))
    settleRefresh(true)
    return
  }
  if (err.code === 'csrf_failed') expireSession()
  if (res.status === 401 || err.code === 'invalid_refresh_token' || err.code === 'refresh_reused') {
    settleRefresh(false)
    sessionExpired()
  }
  throw err
}

// --- public API --------------------------------------------------------------------

async function request<T>(method: Method, path: string, opts: RequestOptions<T>): Promise<T> {
  const sentAt = refreshGeneration
  let res = await send(method, path, opts)
  if (res.status === 401 && !path.startsWith('/v1/auth/')) {
    const err = await toApiError(res)
    // Only an access-token failure is worth a refresh; e.g. invalid_credentials is final.
    if (err.code !== 'unauthorized') throw err
    if (sentAt === refreshGeneration) {
      await refreshSession()
    } else if (!lastRefreshOk) {
      // The session expired while this request was in flight: don't refresh or expire again.
      throw err
    }
    // else: a refresh succeeded after this request was sent; just retry once.
    res = await send(method, path, opts)
  }
  if (!res.ok) throw await toApiError(res)
  return parse(res, opts.schema)
}

/**
 * Typed API client. Every response is validated with `opts.schema`; a 204 resolves
 * `undefined`, so pass `z.undefined()` as the schema for no-content endpoints.
 */
export const api = {
  get: <T>(path: string, opts: RequestOptions<T>) => request('GET', path, opts),
  post: <T>(path: string, opts: RequestOptions<T>) => request('POST', path, opts),
  patch: <T>(path: string, opts: RequestOptions<T>) => request('PATCH', path, opts),
  put: <T>(path: string, opts: RequestOptions<T>) => request('PUT', path, opts),
  delete: <T>(path: string, opts: RequestOptions<T>) => request('DELETE', path, opts),
}
