import { createContext, useContext } from 'react'
import type { Org } from '../api/schemas'

export const OrgContext = createContext<Org | null>(null)

/** The org from the `:orgId` route param. Only valid below `OrgProvider`. */
export function useCurrentOrg(): Org {
  const org = useContext(OrgContext)
  if (!org) throw new Error('useCurrentOrg must be used inside an org route')
  return org
}
