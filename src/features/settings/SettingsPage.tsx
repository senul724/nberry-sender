import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../../api/client'
import { friendlyMessage } from '../../api/errors'
import { Org } from '../../api/schemas'
import { useCurrentOrg } from '../../orgs/context'
import { orgKey, orgsKey } from '../../orgs/queries'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { TextArea } from '../../ui/TextArea'
import { CallbackSecretSection } from './CallbackSecret'
import { LogoSection } from './LogoSection'

const FIELDS = ['name', 'description', 'website', 'callback_url'] as const
type FieldName = (typeof FIELDS)[number]
type Values = Record<FieldName, string>

const valuesOf = (org: Org): Values => ({
  name: org.name,
  description: org.description ?? '',
  website: org.website ?? '',
  callback_url: org.callback_url ?? '',
})

function DetailsForm({ org }: { org: Org }) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Values>(() => valuesOf(org))
  const [nameError, setNameError] = useState<string | undefined>()
  const [saved, setSaved] = useState(false)

  const saved_ = valuesOf(org)
  const trimmed = (f: FieldName) => values[f].trim()
  const changed = FIELDS.filter((f) => trimmed(f) !== saved_[f].trim())

  const save = useMutation({
    mutationFn: (patch: Partial<Values>) =>
      api.patch(`/v1/orgs/${encodeURIComponent(org.id)}`, { schema: Org, body: patch }),
    onSuccess: (updated) => {
      queryClient.setQueryData(orgKey(org.id), updated)
      void queryClient.invalidateQueries({ queryKey: orgsKey, exact: true })
      setSaved(true)
    },
  })

  const set = (f: FieldName) => (value: string) => {
    setValues((v) => ({ ...v, [f]: value }))
    setSaved(false)
    if (f === 'name') setNameError(undefined)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (changed.length === 0 || save.isPending) return
    if (values.name.trim() === '') {
      setNameError('Enter a name.')
      return
    }
    // Only the changed fields: an absent field stays as it is on the server.
    save.mutate(Object.fromEntries(changed.map((f) => [f, trimmed(f)])))
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <h2 className="text-lg font-semibold">Details</h2>
      {save.isError && <Banner tone="error">{friendlyMessage(save.error)}</Banner>}
      {saved && <Banner tone="success">Saved</Banner>}
      <Field
        label="Name"
        value={values.name}
        error={nameError}
        onChange={(e) => set('name')(e.target.value)}
      />
      <TextArea
        label="Description"
        rows={3}
        value={values.description}
        onChange={(e) => set('description')(e.target.value)}
      />
      <Field
        label="Website"
        type="url"
        value={values.website}
        onChange={(e) => set('website')(e.target.value)}
      />
      <Field
        label="Callback URL"
        type="url"
        hint="Public https URL where nBerry sends new customer links."
        value={values.callback_url}
        onChange={(e) => set('callback_url')(e.target.value)}
      />
      <Button type="submit" loading={save.isPending} disabled={changed.length === 0}>
        Save changes
      </Button>
    </form>
  )
}

export function SettingsPage() {
  const org = useCurrentOrg()
  return (
    <div className="max-w-2xl space-y-10">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <DetailsForm org={org} />
      <LogoSection org={org} />
      <CallbackSecretSection orgId={org.id} />
    </div>
  )
}
