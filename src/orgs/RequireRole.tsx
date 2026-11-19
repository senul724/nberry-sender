import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../ui/EmptyState'
import { linkClass } from '../ui/focus'
import { useCurrentOrg } from './context'
import { useRole, type Can } from './roles'

/** Renders children only when the user's role has the permission; otherwise a no-access state. */
export function RequireRole({ can, children }: { can: keyof Can; children: ReactNode }) {
  const { can: allowed } = useRole()
  const org = useCurrentOrg()
  if (allowed[can]) return children
  return (
    <EmptyState
      title="You don't have access to this page"
      description="Ask an owner of this sender if you need it."
      action={
        <Link to={`/orgs/${org.id}`} className={linkClass}>
          Back to overview
        </Link>
      }
    />
  )
}
