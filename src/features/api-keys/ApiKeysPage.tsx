import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../../api/client'
import { friendlyMessage } from '../../api/errors'
import { z } from 'zod'
import { ApiKey, ApiKeyCreated, ApiKeyList } from '../../api/schemas'
import { useCurrentOrg } from '../../orgs/context'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { CopyField } from '../../ui/CopyField'
import { Dialog } from '../../ui/Dialog'
import { EmptyState } from '../../ui/EmptyState'
import { ErrorState } from '../../ui/ErrorState'
import { Field } from '../../ui/Field'
import { Spinner } from '../../ui/Spinner'
import { Table } from '../../ui/Table'

const undefinedSchema = z.undefined()
const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : null)

/**
 * Create dialog. The created key lives only in this component's state (no query or mutation
 * cache), and unmounting the dialog contents drops it.
 */
function CreateKeyDialog({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | undefined>()
  const [created, setCreated] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (name.trim() === '') {
      setNameError('Enter a name for the key.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await api.post(`/v1/orgs/${encodeURIComponent(orgId)}/api-keys`, {
        schema: ApiKeyCreated,
        body: { name: name.trim() },
      })
      void queryClient.invalidateQueries({ queryKey: ['orgs', orgId, 'api-keys'] })
      if (mounted.current) setCreated(res.key)
    } catch (err) {
      if (mounted.current) setError(friendlyMessage(err))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  if (created !== null) {
    return (
      <div className="space-y-4">
        <Banner tone="warning">
          You won't see this key again. Copy it now and store it somewhere safe.
        </Banner>
        <CopyField label="API key" value={created} />
        <div className="flex justify-end">
          {/* The form that had focus just unmounted; keep focus (and Escape) inside the dialog. */}
          <Button autoFocus onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    )
  }
  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
      {error && <Banner tone="error">{error}</Banner>}
      <Field
        label="Name"
        hint="For example, the server or service that will use it."
        value={name}
        error={nameError}
        onChange={(e) => {
          setName(e.target.value)
          setNameError(undefined)
        }}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          Create key
        </Button>
      </div>
    </form>
  )
}

export function ApiKeysPage() {
  const org = useCurrentOrg()
  const queryClient = useQueryClient()
  const listKey = ['orgs', org.id, 'api-keys']
  const keys = useQuery({
    queryKey: listKey,
    queryFn: () =>
      api.get(`/v1/orgs/${encodeURIComponent(org.id)}/api-keys`, { schema: ApiKeyList }),
  })
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<ApiKey | null>(null)

  const revoke = useMutation({
    mutationFn: (k: ApiKey) =>
      api.delete(`/v1/orgs/${encodeURIComponent(org.id)}/api-keys/${encodeURIComponent(k.id)}`, {
        schema: undefinedSchema,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: listKey })
      setRevoking(null)
    },
  })

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">API keys</h1>
        <Button onClick={() => setCreating(true)}>Create API key</Button>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Your servers use API keys to send unicast messages and create invites. Keys can never be
        viewed again after creation.
      </p>

      {keys.isPending && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
      {keys.isError && (
        <ErrorState message={friendlyMessage(keys.error)} onRetry={() => void keys.refetch()} />
      )}
      {keys.isSuccess && keys.data.api_keys.length === 0 && (
        <EmptyState
          title="No API keys yet"
          description="Create a key to let your server send messages."
        />
      )}
      {keys.isSuccess && keys.data.api_keys.length > 0 && (
        <Table
          caption="API keys"
          rows={keys.data.api_keys}
          rowKey={(k) => k.id}
          columns={[
            { header: 'Name', cell: (k) => k.name },
            { header: 'Prefix', cell: (k) => <code className="font-mono">{k.prefix}</code> },
            { header: 'Created by', cell: (k) => k.created_by ?? '-' },
            { header: 'Created', cell: (k) => fmt(k.created_at) },
            { header: 'Last used', cell: (k) => fmt(k.last_used_at) ?? 'Never' },
            {
              header: 'Status',
              cell: (k) =>
                k.revoked_at ? (
                  <span title={fmt(k.revoked_at) ?? undefined}>Revoked</span>
                ) : (
                  <Button
                    variant="secondary"
                    aria-label={`Revoke ${k.name}`}
                    onClick={() => {
                      revoke.reset()
                      setRevoking(k)
                    }}
                  >
                    Revoke
                  </Button>
                ),
            },
          ]}
        />
      )}

      {/* Mounted only while open, so closing drops the new key from state. */}
      <Dialog open={creating} onClose={() => setCreating(false)} title="Create API key">
        <CreateKeyDialog orgId={org.id} onClose={() => setCreating(false)} />
      </Dialog>

      <Dialog open={revoking !== null} onClose={() => setRevoking(null)} title="Revoke API key?">
        <p className="text-sm">
          {revoking?.name} will stop working immediately. Servers using it will get errors until you
          give them a new key. This cannot be undone.
        </p>
        {revoke.isError && (
          <Banner tone="error" className="mt-3">
            {friendlyMessage(revoke.error)}
          </Banner>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRevoking(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={revoke.isPending}
            onClick={() => revoking && revoke.mutate(revoking)}
          >
            Revoke key
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
