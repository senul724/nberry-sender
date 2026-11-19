import { Navigate } from 'react-router-dom'
import { friendlyMessage } from '../../api/errors'
import { useOrgs } from '../../orgs/queries'
import { ErrorState } from '../../ui/ErrorState'
import { Spinner } from '../../ui/Spinner'
import { CreateOrgPage } from './CreateOrgPage'

/** `/`: go to the first org, or offer to create one. */
export function IndexRedirect() {
  const orgs = useOrgs()
  if (orgs.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }
  if (orgs.isError) {
    return <ErrorState message={friendlyMessage(orgs.error)} onRetry={() => void orgs.refetch()} />
  }
  const first = orgs.data[0]
  if (first) return <Navigate to={`/orgs/${first.id}`} replace />
  return <CreateOrgPage first />
}
