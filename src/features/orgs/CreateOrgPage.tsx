import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { friendlyMessage } from '../../api/errors'
import { Org } from '../../api/schemas'
import { orgKey, orgsKey } from '../../orgs/queries'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'

/** `POST /v1/orgs`. Used at /orgs/new and, with `first`, as the empty state at `/`. */
export function CreateOrgPage({ first = false }: { first?: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [website, setWebsite] = useState('')
  const [callbackUrl, setCallbackUrl] = useState('')

  const create = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = { name: name.trim() }
      if (description.trim()) body.description = description.trim()
      if (website.trim()) body.website = website.trim()
      if (callbackUrl.trim()) body.callback_url = callbackUrl.trim()
      return api.post('/v1/orgs', { schema: Org, body })
    },
    onSuccess: async (org) => {
      queryClient.setQueryData(orgKey(org.id), org)
      await queryClient.invalidateQueries({ queryKey: orgsKey, exact: true })
      navigate(`/orgs/${org.id}`)
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    create.mutate()
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {first ? 'Create your first sender' : 'Create a sender'}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          A sender is the business your customers subscribe to. You can add details later.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        {create.isError && <Banner tone="error">{friendlyMessage(create.error)}</Banner>}
        <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Field
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Field
          label="Website (optional)"
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
        <Field
          label="Callback URL (optional)"
          type="url"
          hint="A public https URL we call when a customer links to you."
          value={callbackUrl}
          onChange={(e) => setCallbackUrl(e.target.value)}
        />
        <Button type="submit" loading={create.isPending}>
          Create sender
        </Button>
      </form>
    </div>
  )
}
