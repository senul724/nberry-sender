import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { friendlyMessage } from '../../api/errors'
import { Org, OrgStatus } from '../../api/schemas'
import { useMe } from '../../auth/session'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { Field } from '../../ui/Field'
import { linkClass } from '../../ui/focus'
import { Select } from '../../ui/Select'
import { Spinner } from '../../ui/Spinner'

const RATE_ERROR = 'Enter a whole number from 1 to 1000.'

export function AdminPage() {
  const me = useMe()
  const [orgId, setOrgId] = useState('')
  const [idError, setIdError] = useState<string | undefined>()
  const [status, setStatus] = useState<OrgStatus>('verified')
  const [rate, setRate] = useState('')
  const [rateError, setRateError] = useState<string | undefined>()
  const [updated, setUpdated] = useState<Org | null>(null)

  const base = `/v1/admin/orgs/${encodeURIComponent(orgId.trim())}`
  const setStatusM = useMutation({
    mutationFn: () => api.put(`${base}/status`, { schema: Org, body: { status } }),
    onSuccess: setUpdated,
  })
  const setRateM = useMutation({
    mutationFn: (n: number) =>
      api.put(`${base}/send-rate`, { schema: Org, body: { send_rate_per_sec: n } }),
    onSuccess: setUpdated,
  })

  if (me.isPending) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }
  if (!me.data?.is_admin) {
    return (
      <EmptyState
        title="You don't have access to this page"
        action={
          <Link to="/" className={linkClass}>
            Back to your senders
          </Link>
        }
      />
    )
  }

  function requireId(): boolean {
    if (orgId.trim() === '') {
      setIdError('Enter an organization ID.')
      return false
    }
    return true
  }

  function submitStatus(e: FormEvent) {
    e.preventDefault()
    setRateM.reset()
    if (!requireId() || setStatusM.isPending) return
    setStatusM.mutate()
  }

  function submitRate(e: FormEvent) {
    e.preventDefault()
    setStatusM.reset()
    if (!requireId() || setRateM.isPending) return
    const n = Number(rate)
    if (rate.trim() === '' || !Number.isInteger(n) || n < 1 || n > 1000) {
      setRateError(RATE_ERROR)
      return
    }
    setRateError(undefined)
    setRateM.mutate(n)
  }

  const error = setStatusM.error ?? setRateM.error

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <Field
        label="Organization ID"
        value={orgId}
        autoComplete="off"
        error={idError}
        onChange={(e) => {
          setOrgId(e.target.value)
          setIdError(undefined)
        }}
      />
      {error && <Banner tone="error">{friendlyMessage(error)}</Banner>}

      <form onSubmit={submitStatus} noValidate className="space-y-3">
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(OrgStatus.catch('verified').parse(e.target.value))}
        >
          <option value="verified">Verified</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </Select>
        <Button type="submit" loading={setStatusM.isPending}>
          Update status
        </Button>
      </form>

      <form onSubmit={submitRate} noValidate className="space-y-3">
        <Field
          label="Send rate per second"
          type="number"
          inputMode="numeric"
          value={rate}
          error={rateError}
          hint="1 to 1000"
          onChange={(e) => {
            setRate(e.target.value)
            setRateError(undefined)
          }}
        />
        <Button type="submit" loading={setRateM.isPending}>
          Update send rate
        </Button>
      </form>

      {updated && (
        <section
          aria-label="Updated organization"
          className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800"
        >
          <h2 className="text-base font-semibold">{updated.name}</h2>
          <p>Status: {updated.status}</p>
          <p>Send rate: {updated.send_rate_per_sec} per second</p>
        </section>
      )}
    </div>
  )
}
