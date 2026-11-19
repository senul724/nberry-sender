import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { api } from '../../api/client'
import { friendlyMessage } from '../../api/errors'
import { useCurrentOrg } from '../../orgs/context'
import { dropOrg } from '../../orgs/queries'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'

const undefinedSchema = z.undefined()

export function DangerPage() {
  const org = useCurrentOrg()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [typed, setTyped] = useState('')

  const del = useMutation({
    mutationFn: () =>
      api.delete(`/v1/orgs/${encodeURIComponent(org.id)}`, {
        schema: undefinedSchema,
        body: { confirm_name: typed },
      }),
    onSuccess: () => {
      // Leave first so nothing refetches the deleted org, then drop its caches.
      navigate('/', { replace: true })
      dropOrg(queryClient, org.id)
    },
  })

  const matches = typed === org.name
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (matches && !del.isPending) del.mutate()
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Danger zone</h1>
      <form
        onSubmit={submit}
        noValidate
        className="space-y-4 rounded-lg border border-red-300 p-4 dark:border-red-900"
      >
        <h2 className="text-lg font-semibold">Delete this sender</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This permanently deletes {org.name}, its API keys, customer links and message history. It
          cannot be undone.
        </p>
        {del.isError && <Banner tone="error">{friendlyMessage(del.error)}</Banner>}
        <Field
          label={`Type ${org.name} to confirm`}
          value={typed}
          autoComplete="off"
          onChange={(e) => setTyped(e.target.value)}
        />
        <Button type="submit" variant="danger" disabled={!matches} loading={del.isPending}>
          Delete sender
        </Button>
      </form>
    </div>
  )
}
