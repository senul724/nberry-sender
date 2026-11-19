import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { api } from '../../api/client'
import { RequireAuth } from '../../auth/RequireAuth'
import { SessionProvider } from '../../auth/SessionProvider'
import { Outlet, type RouteObject } from 'react-router-dom'
import { ORIGIN, testMe, testTokens, unauthorized } from '../../test/handlers'
import { renderApp } from '../../test/render'
import { server } from '../../test/server'
import { LogoutButton } from './LogoutButton'
import { safeNext, useMe } from '../../auth/session'
import { SignupPage } from './SignupPage'
import { LoginPage } from './LoginPage'

const cfg = vi.hoisted(() => ({ apiBaseUrl: '', googleClientId: undefined as string | undefined }))
vi.mock('../../config', () => ({ config: cfg }))

function HomePage() {
  const me = useMe()
  return (
    <main>
      <h1>Signed in as {me.data?.name}</h1>
      <LogoutButton />
    </main>
  )
}

const apiErr = (code: string, status: number, message = 'm') =>
  HttpResponse.json({ error: { code, message } }, { status })

/** Login/me handlers for a user who is signed out until the login endpoint succeeds. */
function loginFlow(loginResponse: () => Response = () => HttpResponse.json(testTokens)) {
  let signedIn = false
  server.use(
    http.post(`${ORIGIN}/v1/auth/login`, () => {
      const res = loginResponse()
      if (res.status === 200) signedIn = true
      return res
    }),
    http.get(`${ORIGIN}/v1/me`, () => (signedIn ? HttpResponse.json(testMe) : unauthorized())),
  )
  return {
    signIn: () => {
      signedIn = true
    },
  }
}

const routes: RouteObject[] = [
  {
    element: (
      <SessionProvider>
        <Outlet />
      </SessionProvider>
    ),
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/orgs/o1', element: <p>Org page</p> },
        ],
      },
    ],
  },
]

async function fillLogin(user: ReturnType<typeof userEvent.setup>, email = 'ada@example.com') {
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), 'hunter2hunter2')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

beforeEach(() => {
  cfg.googleClientId = undefined
  delete window.google
})

describe('login', () => {
  it('without MFA stores csrf, invalidates me, and navigates to next or /', async () => {
    const user = userEvent.setup()
    loginFlow()
    let csrf: string | null = null
    server.use(
      http.post(`${ORIGIN}/v1/probe`, ({ request }) => {
        csrf = request.headers.get('x-csrf-token')
        return HttpResponse.json({ ok: true })
      }),
    )
    const { router, queryClient } = renderApp({ route: '/login?next=%2Forgs%2Fo1', routes })
    await fillLogin(user)
    expect(await screen.findByText('Org page')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/orgs/o1')
    expect(queryClient.getQueryData(['me'])).toEqual(testMe)
    await api.post('/v1/probe', { schema: z.object({ ok: z.boolean() }), body: {} })
    expect(csrf).toBe('csrf-1')
  })

  it('goes to / when there is no next, and ignores off-site next values', async () => {
    const user = userEvent.setup()
    loginFlow()
    const { router } = renderApp({ route: '/login?next=%2F%2Fevil.example', routes })
    await fillLogin(user)
    expect(await screen.findByText('Signed in as Ada Lovelace')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('with mfa_required shows the 6-digit code step and posts mfa_token, code, client web and device to /v1/auth/mfa/verify', async () => {
    const user = userEvent.setup()
    const flow = loginFlow(() => HttpResponse.json({ mfa_required: true, mfa_token: 'm1' }))
    let body: unknown
    server.use(
      http.post(`${ORIGIN}/v1/auth/mfa/verify`, async ({ request }) => {
        body = await request.json()
        flow.signIn()
        return HttpResponse.json(testTokens)
      }),
    )
    const { router } = renderApp({ route: '/login', routes })
    await fillLogin(user)
    const code = await screen.findByLabelText('6-digit code')
    expect(code).toHaveAttribute('inputmode', 'numeric')
    expect(code).toHaveAttribute('autocomplete', 'one-time-code')
    await user.type(code, '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    await screen.findByText('Signed in as Ada Lovelace')
    expect(body).toEqual({
      mfa_token: 'm1',
      code: '123456',
      client: 'web',
      device: { name: expect.any(String), platform: 'web' },
    })
    expect(router.state.location.pathname).toBe('/')
  })

  it('sends client web and a device on the login request', async () => {
    const user = userEvent.setup()
    let body: unknown
    loginFlow()
    server.use(
      http.post(`${ORIGIN}/v1/auth/login`, async ({ request }) => {
        body = await request.json()
        return apiErr('invalid_credentials', 401)
      }),
    )
    renderApp({ route: '/login', routes })
    await fillLogin(user)
    await screen.findByRole('alert')
    expect(body).toEqual({
      email: 'ada@example.com',
      password: 'hunter2hunter2',
      client: 'web',
      device: { name: expect.any(String), platform: 'web' },
    })
  })

  it('invalid_credentials shows friendly copy and keeps the email', async () => {
    const user = userEvent.setup()
    loginFlow(() => apiErr('invalid_credentials', 401))
    renderApp({ route: '/login', routes })
    await fillLogin(user)
    expect(await screen.findByText('That email or password is incorrect.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com')
  })

  it('email_not_verified offers a link to /verify-email prefilled with the email', async () => {
    const user = userEvent.setup()
    loginFlow(() => apiErr('email_not_verified', 403))
    renderApp({ route: '/login', routes })
    await fillLogin(user)
    const link = await screen.findByRole('link', { name: 'Verify your email' })
    expect(link).toHaveAttribute('href', '/verify-email?email=ada%40example.com')
  })
})

describe('signup, verify, forgot, reset', () => {
  it('signup shows check-your-email and goes to /verify-email', async () => {
    const user = userEvent.setup()
    let body: unknown
    server.use(
      http.post(`${ORIGIN}/v1/auth/signup`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ status: 'check_email' }, { status: 202 })
      }),
    )
    const { router } = renderApp({ route: '/signup' })
    await user.type(screen.getByLabelText('Name'), 'Ada')
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'hunter2hunter2')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/verify-email')
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com')
    expect(body).toEqual({ name: 'Ada', email: 'ada@example.com', password: 'hunter2hunter2' })
  })

  it('verify-email posts email and code, then resend uses the neutral copy', async () => {
    const user = userEvent.setup()
    let verify: unknown
    let resend: unknown
    server.use(
      http.post(`${ORIGIN}/v1/auth/verify-email`, async ({ request }) => {
        verify = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
      http.post(`${ORIGIN}/v1/auth/resend-verification`, async ({ request }) => {
        resend = await request.json()
        return HttpResponse.json({ status: 'check_email' }, { status: 202 })
      }),
    )
    const { router } = renderApp({ route: '/verify-email?email=ada%40example.com' })
    await user.click(screen.getByRole('button', { name: 'Resend code' }))
    expect(
      await screen.findByText("If that account exists, we've sent a code."),
    ).toBeInTheDocument()
    expect(resend).toEqual({ email: 'ada@example.com' })
    await user.type(screen.getByLabelText('6-digit code'), '654321')
    await user.click(screen.getByRole('button', { name: 'Verify email' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(verify).toEqual({ email: 'ada@example.com', code: '654321' })
    expect(await screen.findByText('Email verified. You can sign in now.')).toBeInTheDocument()
  })

  it.each([
    ['202', () => HttpResponse.json({ status: 'check_email' }, { status: 202 })],
    ['404', () => apiErr('not_found', 404)],
  ])('forgot always shows the neutral copy (%s)', async (_name, respond) => {
    const user = userEvent.setup()
    server.use(http.post(`${ORIGIN}/v1/auth/password/forgot`, respond))
    renderApp({ route: '/forgot' })
    await user.type(screen.getByLabelText('Email'), 'nobody@example.com')
    await user.click(screen.getByRole('button', { name: 'Send code' }))
    expect(
      await screen.findByText("If that account exists, we've sent a code."),
    ).toBeInTheDocument()
  })

  it('forgot shows the rate-limit copy on 429', async () => {
    const user = userEvent.setup()
    server.use(http.post(`${ORIGIN}/v1/auth/password/forgot`, () => apiErr('rate_limited', 429)))
    renderApp({ route: '/forgot' })
    await user.type(screen.getByLabelText('Email'), 'a@example.com')
    await user.click(screen.getByRole('button', { name: 'Send code' }))
    expect(
      await screen.findByText("You've hit a rate limit. Wait a bit and try again."),
    ).toBeInTheDocument()
    expect(screen.queryByText(/we've sent a code/)).not.toBeInTheDocument()
  })

  it('reset posts email, code, new_password, then sends to /login with a "signed out everywhere" note', async () => {
    const user = userEvent.setup()
    let body: unknown
    server.use(
      http.post(`${ORIGIN}/v1/auth/password/reset`, async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router } = renderApp({ route: '/reset?email=ada%40example.com' })
    await user.type(screen.getByLabelText('6-digit code'), '123456')
    await user.type(screen.getByLabelText('New password'), 'brand-new-pass-1')
    await user.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(await screen.findByText(/signed out everywhere/)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(body).toEqual({
      email: 'ada@example.com',
      code: '123456',
      new_password: 'brand-new-pass-1',
    })
  })
})

describe('RequireAuth and session', () => {
  it('redirects to /login?next= when /v1/me and refresh both fail', async () => {
    const { router } = renderApp({ route: '/orgs/o1', session: null, routes })
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toBe('?next=%2Forgs%2Fo1')
  })

  it('keeps the user in when /v1/me 401s once and refresh succeeds', async () => {
    let refreshed = false
    let refreshCalls = 0
    server.use(
      http.get(`${ORIGIN}/v1/me`, () => (refreshed ? HttpResponse.json(testMe) : unauthorized())),
      http.post(`${ORIGIN}/v1/auth/refresh`, () => {
        refreshCalls++
        refreshed = true
        return HttpResponse.json(testTokens)
      }),
    )
    const { router } = renderApp({ route: '/', routes })
    expect(await screen.findByText('Signed in as Ada Lovelace')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(refreshCalls).toBe(1)
  })

  it('session expiry clears the cache, goes to /login?next=, and repeated calls navigate once', async () => {
    server.use(
      http.get(`${ORIGIN}/v1/other`, unauthorized),
      http.post(`${ORIGIN}/v1/auth/refresh`, () => apiErr('refresh_reused', 401)),
    )
    const { router, queryClient } = renderApp({ route: '/orgs/o1', session: testMe, routes })
    await screen.findByText('Org page')
    const seen: string[] = []
    router.subscribe((s) => seen.push(s.location.pathname + s.location.search))
    const other = z.object({ ok: z.boolean() })
    await act(async () => {
      await expect(api.get('/v1/other', { schema: other })).rejects.toBeDefined()
      await expect(api.get('/v1/other', { schema: other })).rejects.toBeDefined()
    })
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(router.state.location.search).toBe('?next=%2Forgs%2Fo1')
    expect(seen.filter((p) => p.startsWith('/login'))).toEqual(['/login?next=%2Forgs%2Fo1'])
    expect(queryClient.getQueryData(['me'])).toBeUndefined()
  })

  it('session expiry on a public page does not redirect again', async () => {
    server.use(
      http.get(`${ORIGIN}/v1/other`, unauthorized),
      http.post(`${ORIGIN}/v1/auth/refresh`, () => apiErr('refresh_reused', 401)),
    )
    const { router } = renderApp({ route: '/login', routes })
    await screen.findByRole('heading', { name: 'Sign in' })
    await act(async () => {
      await expect(
        api.get('/v1/other', { schema: z.object({ ok: z.boolean() }) }),
      ).rejects.toBeDefined()
    })
    expect(router.state.location.pathname + router.state.location.search).toBe('/login')
  })

  it('logout posts /v1/auth/logout with CSRF, clears the cache and lands on /login', async () => {
    const user = userEvent.setup()
    let csrf: string | null = null
    server.use(
      http.post(`${ORIGIN}/v1/auth/logout`, ({ request }) => {
        csrf = request.headers.get('x-csrf-token')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router, queryClient } = renderApp({ route: '/', session: testMe, routes })
    await screen.findByText('Signed in as Ada Lovelace')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(router.state.location.pathname).toBe('/login')
    expect(csrf).toBeTypeOf('string')
    expect(queryClient.getQueryData(['me'])).toBeUndefined()
  })
})

describe('Task 3 follow-ups', () => {
  it('forgot shows the error banner on a network error and on 5xx', async () => {
    const user = userEvent.setup()
    server.use(http.post(`${ORIGIN}/v1/auth/password/forgot`, () => HttpResponse.error()))
    renderApp({ route: '/forgot' })
    await user.type(screen.getByLabelText('Email'), 'a@example.com')
    await user.click(screen.getByRole('button', { name: 'Send code' }))
    expect(
      await screen.findByText("Can't reach nBerry. Check your connection and try again."),
    ).toBeInTheDocument()
    expect(screen.queryByText(/we've sent a code/)).not.toBeInTheDocument()

    server.use(
      http.post(`${ORIGIN}/v1/auth/password/forgot`, () => apiErr('internal', 503, 'down')),
    )
    await user.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByText('down')).toBeInTheDocument()
    expect(screen.queryByText(/we've sent a code/)).not.toBeInTheDocument()
  })

  it('forgot keeps the neutral copy for other 4xx', async () => {
    const user = userEvent.setup()
    server.use(http.post(`${ORIGIN}/v1/auth/password/forgot`, () => apiErr('not_found', 404)))
    renderApp({ route: '/forgot' })
    await user.type(screen.getByLabelText('Email'), 'a@example.com')
    await user.click(screen.getByRole('button', { name: 'Send code' }))
    expect(
      await screen.findByText("If that account exists, we've sent a code."),
    ).toBeInTheDocument()
  })

  it('MFA "Back to sign in" clears the stale error and code', async () => {
    const user = userEvent.setup()
    loginFlow(() => HttpResponse.json({ mfa_required: true, mfa_token: 'm1' }))
    server.use(
      http.post(`${ORIGIN}/v1/auth/mfa/verify`, () => apiErr('invalid_code', 401, 'Wrong code')),
    )
    renderApp({ route: '/login', routes })
    await fillLogin(user)
    await user.type(await screen.findByLabelText('6-digit code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByText('Wrong code')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(screen.queryByText('Wrong code')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Password'), 'hunter2hunter2')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByLabelText('6-digit code')).toHaveValue('')
    expect(screen.queryByText('Wrong code')).not.toBeInTheDocument()
  })

  it.each(['/\\evil.example', 'https://evil.example', 'javascript:alert(1)', '//evil.example'])(
    'safeNext rejects %s',
    (raw) => {
      expect(safeNext(raw)).toBe('/')
    },
  )

  it('safeNext keeps same-origin paths', () => {
    expect(safeNext('/orgs/o1?x=1')).toBe('/orgs/o1?x=1')
  })

  it.each(['/login', '/signup'])(
    'a signed-in user who is known to be loaded is redirected from %s to /',
    async (path) => {
      const { router } = renderApp({ route: '/', session: testMe, routes })
      await screen.findByText('Signed in as Ada Lovelace')
      await act(() => router.navigate(path))
      await waitFor(() => expect(router.state.location.pathname).toBe('/'))
      expect(screen.getByText('Signed in as Ada Lovelace')).toBeInTheDocument()
    },
  )

  it('a signed-out user on /login sees the form and triggers no /v1/me request', async () => {
    let meCalls = 0
    server.use(
      http.get(`${ORIGIN}/v1/me`, () => {
        meCalls++
        return unauthorized()
      }),
    )
    renderApp({ route: '/login', routes })
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(meCalls).toBe(0)
  })
})

describe('Google button', () => {
  it('is not rendered without VITE_GOOGLE_CLIENT_ID', async () => {
    renderApp({ route: '/login', routes })
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(document.querySelector('script[src*="accounts.google.com"]')).toBeNull()
    expect(window.google).toBeUndefined()
  })

  it('initializes Google with the client id and posts the credential to /v1/auth/google', async () => {
    cfg.googleClientId = 'client-123'
    let callback: ((r: { credential: string }) => void) | undefined
    const initialize = vi.fn((o: { callback: (r: { credential: string }) => void }) => {
      callback = o.callback
    })
    const renderButton = vi.fn()
    window.google = { accounts: { id: { initialize, renderButton } } }
    let body: unknown
    const flow = loginFlow()
    server.use(
      http.post(`${ORIGIN}/v1/auth/google`, async ({ request }) => {
        body = await request.json()
        flow.signIn()
        return HttpResponse.json(testTokens)
      }),
    )
    const { router } = renderApp({ route: '/login?next=%2Forgs%2Fo1', routes })
    await waitFor(() => expect(renderButton).toHaveBeenCalled())
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ client_id: 'client-123' }))
    act(() => callback?.({ credential: 'id-token' }))
    await screen.findByText('Org page')
    expect(router.state.location.pathname).toBe('/orgs/o1')
    expect(body).toEqual({
      id_token: 'id-token',
      client: 'web',
      device: { name: expect.any(String), platform: 'web' },
    })
  })
})
