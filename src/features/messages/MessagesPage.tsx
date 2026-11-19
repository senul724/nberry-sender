import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import { friendlyMessage } from '../../api/errors'
import { Message, MessageList } from '../../api/schemas'
import { useCurrentOrg } from '../../orgs/context'
import { EmptyState } from '../../ui/EmptyState'
import { ErrorState } from '../../ui/ErrorState'
import { LoadMore } from '../../ui/LoadMore'
import { Select } from '../../ui/Select'
import { Spinner } from '../../ui/Spinner'
import { StatusPill } from '../../ui/StatusPill'
import { Table, type Column } from '../../ui/Table'

const PAGE = 50

function statusTone(status: string) {
  if (status === 'sent') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'queued') return 'neutral'
  return 'info'
}

function sentFrom(m: Message): string {
  if (m.source === 'api') return 'API'
  return m.sent_by?.name ? m.sent_by.name : 'A team member'
}

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : '-')

const columns: Column<Message>[] = [
  { header: 'Title', cell: (m) => <span className="font-medium">{m.title}</span> },
  { header: 'Kind', cell: (m) => (m.kind === 'broadcast' ? 'Broadcast' : 'Unicast') },
  { header: 'Status', cell: (m) => <StatusPill tone={statusTone(m.status)} label={m.status} /> },
  { header: 'Sent from', cell: sentFrom },
  { header: 'Created', cell: (m) => fmt(m.created_at) },
  { header: 'Sent', cell: (m) => fmt(m.sent_at) },
  { header: 'Failure reason', cell: (m) => m.failure_reason ?? '' },
]

export function MessagesPage() {
  const org = useCurrentOrg()
  const [kind, setKind] = useState('')
  const [status, setStatus] = useState('')

  const q = useInfiniteQuery({
    queryKey: ['orgs', org.id, 'messages'],
    initialPageParam: '',
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE) })
      if (pageParam) params.set('cursor', pageParam)
      return api.get(`/v1/orgs/${encodeURIComponent(org.id)}/messages?${params}`, {
        schema: MessageList,
      })
    },
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })

  const all = q.data?.pages.flatMap((p) => p.messages) ?? []
  const statuses = [...new Set(all.map((m) => m.status))].sort()
  const rows = all.filter((m) => (!kind || m.kind === kind) && (!status || m.status === status))

  let content
  if (q.isPending) {
    content = (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  } else if (q.isError) {
    content = <ErrorState message={friendlyMessage(q.error)} onRetry={() => void q.refetch()} />
  } else if (all.length === 0) {
    content = (
      <EmptyState
        title="No messages yet"
        description="Broadcasts and messages you send appear here."
      />
    )
  } else {
    content = (
      <>
        {rows.length === 0 ? (
          <EmptyState
            title="No messages match these filters"
            description="Filters apply to the messages loaded so far. Load more to search further."
          />
        ) : (
          <Table caption="Messages" columns={columns} rows={rows} rowKey={(m) => m.id} />
        )}
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
      <h1 className="text-2xl font-semibold">Messages</h1>
      <div className="flex flex-wrap gap-4">
        <Select label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All kinds</option>
          <option value="broadcast">Broadcast</option>
          <option value="unicast">Unicast</option>
        </Select>
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>
      {content}
    </div>
  )
}
