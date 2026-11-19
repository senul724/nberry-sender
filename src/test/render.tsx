import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom'
import type { Me } from '../api/schemas'
import { SessionProvider } from '../auth/SessionProvider'
import { routes as appRoutes } from '../router'
import { sessionHandlers } from './handlers'
import { server } from './server'

export interface RenderOptions {
  route?: string
  /**
   * The signed-in user (`GET /v1/me` returns it) or `null` (401 and a failing refresh).
   * Omit to leave `/v1/me` unhandled.
   */
  session?: Me | null
}

function newQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', session }: RenderOptions = {},
): RenderResult & { queryClient: QueryClient } {
  if (session !== undefined) server.use(...sessionHandlers(session))
  const queryClient = newQueryClient()
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <SessionProvider>{ui}</SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...result, queryClient }
}

/**
 * Renders the real route tree (or `routes`) in a memory router. Use `router.state.location`
 * to assert where the app navigated.
 */
export function renderApp({
  route = '/',
  session,
  routes = appRoutes,
}: RenderOptions & { routes?: RouteObject[] } = {}) {
  if (session !== undefined) server.use(...sessionHandlers(session))
  const queryClient = newQueryClient()
  const router = createMemoryRouter(routes, { initialEntries: [route] })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...result, queryClient, router }
}
