import { useContext } from 'react'
import type { Role } from '../api/schemas'
import { OrgContext } from './context'

export interface Can {
  manageMembers: boolean
  editSettings: boolean
  manageKeys: boolean
  send: boolean
  deleteOrg: boolean
}

/** owner = everything; admin = settings, keys, sending; developer = keys and sending. */
export function permissions(role: Role): Can {
  return {
    manageMembers: role === 'owner',
    editSettings: role === 'owner' || role === 'admin',
    manageKeys: true,
    send: true,
    deleteOrg: role === 'owner',
  }
}

/** The signed-in user's role in the current org. Call inside an org route. */
export function useRole() {
  const org = useContext(OrgContext)
  if (!org) throw new Error('useRole must be used inside an org route')
  return { role: org.my_role, can: permissions(org.my_role) }
}
