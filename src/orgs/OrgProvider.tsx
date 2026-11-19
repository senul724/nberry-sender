import { Link, Outlet, useParams } from 'react-router-dom'
import { ApiError, friendlyMessage } from '../api/errors'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { linkClass } from '../ui/focus'
import { Spinner } from '../ui/Spinner'
import { OrgContext } from './context'
import { useOrg } from './queries'
import { StatusBanner } from './StatusBanner'
import { VerifiedBadge } from './VerifiedBadge'

/**
 * Layout route for `/orgs/:orgId`: loads the org, handles loading / not found / error,
 * and provides it to `useCurrentOrg` and `useRole`. Also shows the status banner.
 */
export function OrgProvider() {
  const { orgId } = useParams()
  const org = useOrg(orgId)

  if (org.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }
  if (org.isError) {
    // The server answers 404 for non-members, so 403/404 both mean "not yours or not there".
    if (org.error instanceof ApiError && (org.error.status === 404 || org.error.status === 403)) {
      return (
        <EmptyState
          title="Sender not found"
          description="It may have been deleted, or you may not be a member."
          action={
            <Link to="/" className={linkClass}>
              Go to your senders
            </Link>
          }
        />
      )
    }
    return <ErrorState message={friendlyMessage(org.error)} onRetry={() => void org.refetch()} />
  }

  return (
    <OrgContext.Provider value={org.data}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{org.data.name}</p>
          {org.data.status === 'verified' && <VerifiedBadge />}
        </div>
        <StatusBanner status={org.data.status} />
        <Outlet />
      </div>
    </OrgContext.Provider>
  )
}
