import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, rememberCsrf } from '../api/client'
import { Me, type TokensWeb } from '../api/schemas'

export const ME_KEY = ['me'] as const

function fetchMe() {
  return api.get('/v1/me', { schema: Me })
}

/** The signed-in user. A 401 here has already been through the refresh attempt. */
export function useMe() {
  return useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 5 * 60_000 })
}

/** Only same-origin relative paths are accepted as a post-login destination. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  return raw
}

export function loginPath(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`
}

/** Loads `me` fresh so the guard sees the new session before we navigate. */
export function refreshMe(queryClient: QueryClient) {
  return queryClient.fetchQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 0 })
}

/** Call after login / MFA / Google succeeds: remember CSRF, load `me`, go to `next`. */
export function useCompleteLogin() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useCallback(
    async (tokens: TokensWeb, next: string | null | undefined) => {
      rememberCsrf(tokens.csrf_token)
      await refreshMe(queryClient)
      navigate(safeNext(next), { replace: true })
    },
    [queryClient, navigate],
  )
}
