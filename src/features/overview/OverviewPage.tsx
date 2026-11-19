import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { friendlyMessage } from '../../api/errors'
import { ApiKeyList, Stats } from '../../api/schemas'
import { useCurrentOrg } from '../../orgs/context'
import { useRole } from '../../orgs/roles'
import { ErrorState } from '../../ui/ErrorState'
import { linkClass } from '../../ui/focus'
import { Spinner } from '../../ui/Spinner'
import { StatTile } from '../../ui/StatTile'

type State = 'done' | 'todo' | 'unknown' | 'loading'

const stateLabel: Record<State, string> = {
  done: 'Done',
  todo: 'To do',
  unknown: 'Unknown',
  loading: 'Checking',
}

function ChecklistItem({ label, to, state }: { label: string; to: string | null; state?: State }) {
  return (
    <li className="flex items-center justify-between gap-4 py-2">
      {to ? (
        <Link to={to} className={linkClass}>
          {label}
        </Link>
      ) : (
        <span className="text-sm">{label}</span>
      )}
      {state && (
        <span
          className={
            state === 'done'
              ? 'text-sm text-green-700 dark:text-green-400'
              : 'text-sm text-zinc-500 dark:text-zinc-400'
          }
        >
          {state === 'done' ? '✓ ' : ''}
          {stateLabel[state]}
        </span>
      )}
    </li>
  )
}

const num = new Intl.NumberFormat('en-US')

export function OverviewPage() {
  const org = useCurrentOrg()
  const { can } = useRole()
  const base = `/orgs/${org.id}`

  const stats = useQuery({
    queryKey: ['orgs', org.id, 'stats'],
    queryFn: () => api.get(`/v1/orgs/${encodeURIComponent(org.id)}/stats`, { schema: Stats }),
  })
  // Every role may read keys, but a 403/404 only means we can't tell: never fail the page on it.
  const keys = useQuery({
    queryKey: ['orgs', org.id, 'api-keys'],
    queryFn: () =>
      api.get(`/v1/orgs/${encodeURIComponent(org.id)}/api-keys`, { schema: ApiKeyList }),
  })

  let keyState: State = 'loading'
  if (keys.isSuccess) keyState = keys.data.api_keys.some((k) => !k.revoked_at) ? 'done' : 'todo'
  else if (keys.isError) keyState = 'unknown'

  const settingsTo = can.editSettings ? `${base}/settings` : null

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Overview</h1>

      <section aria-labelledby="stats-heading" className="space-y-3">
        <h2 id="stats-heading" className="sr-only">
          Statistics
        </h2>
        {stats.isPending && <Spinner />}
        {stats.isError && (
          <ErrorState message={friendlyMessage(stats.error)} onRetry={() => void stats.refetch()} />
        )}
        {stats.isSuccess && (
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile label="Subscribers" value={num.format(stats.data.subscriber_count)} />
            <StatTile label="Queued" value={num.format(stats.data.messages_queued)} />
            <StatTile label="Sent" value={num.format(stats.data.messages_sent)} />
            <StatTile label="Failed" value={num.format(stats.data.messages_failed)} />
            <StatTile label="Active links" value={num.format(stats.data.links_active)} />
          </dl>
        )}
      </section>

      <section aria-labelledby="start-heading" className="space-y-2">
        <h2 id="start-heading" className="text-lg font-medium">
          Get started
        </h2>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          <ChecklistItem
            label="Add a logo"
            to={settingsTo}
            state={org.logo_url ? 'done' : 'todo'}
          />
          <ChecklistItem
            label="Set a callback URL"
            to={settingsTo}
            state={org.callback_url ? 'done' : 'todo'}
          />
          <ChecklistItem label="Create an API key" to={`${base}/api-keys`} state={keyState} />
          <ChecklistItem label="Print your QR" to={`${base}/qr`} />
        </ul>
      </section>
    </div>
  )
}
