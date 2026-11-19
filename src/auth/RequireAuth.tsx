import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ApiError, friendlyMessage } from '../api/errors'
import { ErrorState } from '../ui/ErrorState'
import { Spinner } from '../ui/Spinner'
import { loginPath, useMe } from './session'

/** Route guard: spinner while loading, /login?next= on 401 (after the refresh attempt). */
export function RequireAuth() {
  const me = useMe()
  const location = useLocation()

  if (me.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    )
  }
  if (me.isError) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      return <Navigate to={loginPath(location.pathname + location.search)} replace />
    }
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorState message={friendlyMessage(me.error)} onRetry={() => void me.refetch()} />
      </div>
    )
  }
  return <Outlet />
}
