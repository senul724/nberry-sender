import { useQuery, type QueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { Org, OrgList } from '../api/schemas'

export const orgsKey = ['orgs'] as const
export const orgKey = (id: string) => ['orgs', id] as const

/** `GET /v1/orgs`: every org the signed-in user belongs to. */
export function useOrgs() {
  return useQuery({
    queryKey: orgsKey,
    queryFn: () => api.get('/v1/orgs', { schema: OrgList }).then((r) => r.orgs),
  })
}

/** `GET /v1/orgs/{id}`: 404 for a non-member. */
export function useOrg(id: string | undefined) {
  return useQuery({
    queryKey: orgKey(id ?? ''),
    queryFn: () => api.get(`/v1/orgs/${encodeURIComponent(id ?? '')}`, { schema: Org }),
    enabled: !!id,
  })
}

/** After leaving or deleting an org: drop its whole cache subtree and refresh only the list. */
export function dropOrg(queryClient: QueryClient, id: string): void {
  queryClient.removeQueries({ queryKey: orgKey(id) })
  void queryClient.invalidateQueries({ queryKey: orgsKey, exact: true })
}
