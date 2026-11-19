import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import { friendlyMessage } from '../../api/errors'
import { Link, LinkList } from '../../api/schemas'
import { useCurrentOrg } from '../../orgs/context'
import { EmptyState } from '../../ui/EmptyState'
import { ErrorState } from '../../ui/ErrorState'
import { LoadMore } from '../../ui/LoadMore'
import { Select } from '../../ui/Select'
import { Spinner } from '../../ui/Spinner'
import { StatusPill } from '../../ui/StatusPill'
import { Table, type Column } from '../../ui/Table'

const PAGE = 50
const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : '-')

const columns: Column<Link>[] = [
  { header: 'Customer', cell: (l) => <span className="font-medium">{l.customer_ref}</span> },
  {
    header: 'Status',
    cell: (l) => (
      <StatusPill tone={l.status === 'active' ? 'success' : 'neutral'} label={l.status} />
    ),
  },
  { header: 'Linked', cell: (l) => fmt(l.created_at) },
  { header: 'Revoked', cell: (l) => fmt(l.revoked_at) },
  {
    header: 'Callback',
    cell: (l) =>
      l.callback_failed_at ? (
        <span title={fmt(l.callback_failed_at)}>
          <StatusPill tone="warning" label="Callback failed" />
        </span>
      ) : (
        ''
      ),
  },
]

export function CustomersPage() {
  const org = useCurrentOrg()
  const [filter, setFilter] = useState<'all' | 'failed'>('all')

  const q = useInfiniteQuery({
    queryKey: ['orgs', org.id, 'links', filter],
    initialPageParam: '',
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE) })
      if (filter === 'failed') params.set('callback_failed', 'true')
      if (pageParam) params.set('cursor', pageParam)
      return api.get(`/v1/orgs/${encodeURIComponent(org.id)}/links?${params}`, {
        schema: LinkList,
      })
    },
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })

  const rows = q.data?.pages.flatMap((p) => p.links) ?? []
  const anyFailed = rows.some((l) => l.callback_failed_at)

  let content
  if (q.isPending) {
    content = (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  } else if (q.isError) {
    content = <ErrorState message={friendlyMessage(q.error)} onRetry={() => void q.refetch()} />
  } else if (rows.length === 0) {
    content = (
      <EmptyState
        title={filter === 'failed' ? 'No failed callbacks' : 'No linked customers'}
        description={
          filter === 'failed'
            ? 'Every callback we tried was delivered.'
            : 'Customers appear here after they accept an invite.'
        }
      />
    )
  } else {
    content = (
      <>
        <Table
          caption="Linked customers"
          columns={columns}
          rows={rows}
          rowKey={(l) => l.recipient_id}
          rowClassName={(l) =>
            l.callback_failed_at ? 'bg-amber-50 dark:bg-amber-950/30' : undefined
          }
        />
        <LoadMore
          hasMore={q.hasNextPage}
          loading={q.isFetchingNextPage}
          onClick={() => void q.fetchNextPage()}
        />
      </>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Customers</h1>
      <Select
        label="Show"
        value={filter}
        onChange={(e) => setFilter(e.target.value === 'failed' ? 'failed' : 'all')}
      >
        <option value="all">All links</option>
        <option value="failed">Callback failed</option>
      </Select>
      {anyFailed && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Your server can recover these with{' '}
          <code className="font-mono">GET /v1/send/links?customer_ref=</code>
        </p>
      )}
      {content}
    </div>
  )
}
