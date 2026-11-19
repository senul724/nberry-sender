import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { Org } from '../api/schemas'
import { friendlyMessage } from '../api/errors'
import { Select } from '../ui/Select'
import { linkClass } from '../ui/focus'
import { permissions } from './roles'
import { useOrgs } from './queries'

/** The sub-page (e.g. "/messages") of the current org route, or "" for the overview. */
function subPath(pathname: string, orgId: string | undefined): string {
  if (!orgId) return ''
  const prefix = `/orgs/${orgId}`
  return pathname.startsWith(prefix) ? pathname.slice(prefix.length).replace(/\/$/, '') : ''
}

/** Whether `target` may open the sub-page; unknown pages are assumed open to every member. */
function allowed(target: Org, sub: string): boolean {
  const can = permissions(target.my_role)
  if (sub.startsWith('/settings/danger')) return can.deleteOrg
  if (sub.startsWith('/settings')) return can.editSettings
  return true
}

export function OrgSwitcher() {
  const { orgId } = useParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const orgs = useOrgs()

  function onChange(id: string) {
    const target = orgs.data?.find((o) => o.id === id)
    if (!target) return
    const sub = subPath(pathname, orgId)
    navigate(`/orgs/${id}${allowed(target, sub) ? sub : ''}`)
  }

  return (
    <div className="space-y-2">
      {orgs.isError ? (
        <div role="alert" className="text-sm text-red-700 dark:text-red-300">
          {friendlyMessage(orgs.error)}{' '}
          <button type="button" className={linkClass} onClick={() => void orgs.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <Select
          label="Sender"
          value={orgs.data?.some((o) => o.id === orgId) ? orgId : ''}
          disabled={orgs.isPending}
          onChange={(e) => onChange(e.target.value)}
        >
          {!orgs.data?.some((o) => o.id === orgId) && (
            <option value="" disabled>
              {orgs.isPending ? 'Loading…' : 'Select a sender'}
            </option>
          )}
          {orgs.data?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      )}
      <Link to="/orgs/new" className={`${linkClass} block text-sm`}>
        Create sender
      </Link>
    </div>
  )
}
