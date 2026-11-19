import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { api } from '../../api/client'
import { ApiError, friendlyMessage } from '../../api/errors'
import { Me, SessionList, SoleOwnerError, type Session } from '../../api/schemas'
import { GoogleButton } from '../../auth/GoogleButton'
import { ME_KEY, useMe } from '../../auth/session'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { ErrorState } from '../../ui/ErrorState'
import { Field } from '../../ui/Field'
import { linkClass } from '../../ui/focus'
import { Spinner } from '../../ui/Spinner'
import { Table } from '../../ui/Table'

const undefinedSchema = z.undefined()
const SESSIONS_KEY = ['me', 'sessions'] as const
const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : 'Never')

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `acct-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`
  return (
    <section
      aria-labelledby={id}
      className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

const NO_PASSWORD =
  'Your account signs in with Google and has no password, so this is not available.'

function ProfileSection({ me }: { me: Me }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(me.name)
  const [error, setError] = useState<string | undefined>()
  const save = useMutation({
    mutationFn: (n: string) => api.patch('/v1/me', { schema: Me, body: { name: n } }),
    onSuccess: (updated) => queryClient.setQueryData(ME_KEY, updated),
  })
  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '' || trimmed.length > 100) {
      setError('Enter a name of 1 to 100 characters.')
      return
    }
    if (!save.isPending) save.mutate(trimmed)
  }
  return (
    <Section title="Profile">
      <form onSubmit={submit} noValidate className="space-y-3">
        <Field
          label="Name"
          value={name}
          error={error}
          onChange={(e) => {
            setName(e.target.value)
            setError(undefined)
            save.reset()
          }}
        />
        {save.isError && <Banner tone="error">{friendlyMessage(save.error)}</Banner>}
        {save.isSuccess && <Banner tone="success">Saved</Banner>}
        <Button type="submit" loading={save.isPending}>
          Save name
        </Button>
      </form>
    </Section>
  )
}

function MfaSection({ me }: { me: Me }) {
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api.put('/v1/me/2fa', { schema: undefinedSchema, body: { enabled, password } }),
    onSuccess: async () => {
      setPassword('')
      await queryClient.invalidateQueries({ queryKey: ME_KEY })
    },
  })
  return (
    <Section title="Two-step verification">
      <p className="text-sm">
        {me.mfa_enabled
          ? 'On. We email you a code when you sign in.'
          : 'Off. Turn it on to require an emailed code when you sign in.'}
      </p>
      {me.has_password ? (
        <form
          noValidate
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (password !== '' && !toggle.isPending) toggle.mutate(!me.mfa_enabled)
          }}
        >
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              toggle.reset()
            }}
          />
          {toggle.isError && <Banner tone="error">{friendlyMessage(toggle.error)}</Banner>}
          <Button type="submit" loading={toggle.isPending} disabled={password === ''}>
            {me.mfa_enabled ? 'Turn off' : 'Turn on'}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{NO_PASSWORD}</p>
      )}
    </Section>
  )
}

function EmailSection({ me }: { me: Me }) {
  const queryClient = useQueryClient()
  const [newEmail, setNewEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'request' | 'confirm'>('request')
  const [done, setDone] = useState(false)

  const request = useMutation({
    mutationFn: () =>
      api.post('/v1/me/email', {
        schema: z.unknown(),
        body: { new_email: newEmail.trim(), password },
      }),
    onSuccess: () => {
      setPassword('')
      setStep('confirm')
    },
  })
  const confirm = useMutation({
    mutationFn: () =>
      api.post('/v1/me/email/confirm', { schema: undefinedSchema, body: { code: code.trim() } }),
    onSuccess: async () => {
      setStep('request')
      setNewEmail('')
      setCode('')
      setDone(true)
      await queryClient.invalidateQueries({ queryKey: ME_KEY })
    },
  })

  return (
    <Section title="Email address">
      <p className="text-sm">Current email: {me.email}</p>
      {done && <Banner tone="success">Email updated</Banner>}
      {!me.has_password ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{NO_PASSWORD}</p>
      ) : step === 'request' ? (
        <form
          noValidate
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (newEmail.trim() !== '' && password !== '' && !request.isPending) {
              setDone(false)
              request.mutate()
            }
          }}
        >
          <Field
            label="New email"
            type="email"
            autoComplete="off"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {request.isError && <Banner tone="error">{friendlyMessage(request.error)}</Banner>}
          <Button type="submit" loading={request.isPending}>
            Send code
          </Button>
        </form>
      ) : (
        <form
          noValidate
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim() !== '' && !confirm.isPending) confirm.mutate()
          }}
        >
          <p className="text-sm">We sent a code to {newEmail.trim()}. Enter it to confirm.</p>
          <Field
            label="Code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {confirm.isError && <Banner tone="error">{friendlyMessage(confirm.error)}</Banner>}
          <div className="flex gap-2">
            <Button type="submit" loading={confirm.isPending}>
              Confirm email
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                confirm.reset()
                setStep('request')
              }}
            >
              Start over
            </Button>
          </div>
        </form>
      )}
    </Section>
  )
}

function SessionsSection() {
  const queryClient = useQueryClient()
  const list = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => api.get('/v1/me/sessions', { schema: SessionList }),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY })
  const revoke = useMutation({
    mutationFn: (s: Session) =>
      api.delete(`/v1/me/sessions/${encodeURIComponent(s.id)}`, { schema: undefinedSchema }),
    onSuccess: refresh,
  })
  const revokeAll = useMutation({
    mutationFn: () => api.delete('/v1/me/sessions', { schema: undefinedSchema }),
    onSuccess: refresh,
  })
  const label = (s: Session) => s.device_name || s.platform || s.client
  const actionError = revoke.error ?? revokeAll.error

  return (
    <Section title="Sessions">
      {actionError && <Banner tone="error">{friendlyMessage(actionError)}</Banner>}
      {list.isPending && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}
      {list.isError && (
        <ErrorState message={friendlyMessage(list.error)} onRetry={() => void list.refetch()} />
      )}
      {list.isSuccess && list.data.sessions.length === 0 && <EmptyState title="No sessions" />}
      {list.isSuccess && list.data.sessions.length > 0 && (
        <>
          <Table
            caption="Active sessions"
            rows={list.data.sessions}
            rowKey={(s) => s.id}
            columns={[
              { header: 'Device', cell: (s) => <span className="font-medium">{label(s)}</span> },
              { header: 'IP', cell: (s) => s.ip || '-' },
              { header: 'Last used', cell: (s) => fmt(s.last_used_at ?? s.created_at) },
              {
                header: 'Actions',
                cell: (s) =>
                  s.current ? (
                    <span className="text-berry-700 dark:text-berry-300">Current</span>
                  ) : (
                    <Button
                      variant="secondary"
                      aria-label={`Revoke ${label(s)}`}
                      disabled={revoke.isPending}
                      onClick={() => {
                        revokeAll.reset()
                        revoke.mutate(s)
                      }}
                    >
                      Revoke
                    </Button>
                  ),
              },
            ]}
          />
          <Button
            variant="secondary"
            loading={revokeAll.isPending}
            onClick={() => {
              revoke.reset()
              revokeAll.mutate()
            }}
          >
            Sign out everywhere else
          </Button>
        </>
      )}
    </Section>
  )
}

function DeleteSection({ me }: { me: Me }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const del = useMutation({
    mutationFn: () =>
      api.delete('/v1/me', {
        schema: undefinedSchema,
        body: me.has_password ? { password } : undefined,
      }),
    onSuccess: () => {
      navigate('/login', { replace: true })
      queryClient.clear()
    },
  })

  const err = del.error
  const soleOwner =
    err instanceof ApiError && err.code === 'sole_owner' ? SoleOwnerError.safeParse(err.body) : null
  const reauth = err instanceof ApiError && err.code === 'reauth_required'

  return (
    <Section title="Delete account">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        This permanently deletes your account and signs you out everywhere. It cannot be undone.
      </p>
      <form
        noValidate
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (me.has_password && password === '') return
          if (!del.isPending) del.mutate()
        }}
      >
        {me.has_password && (
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              del.reset()
            }}
          />
        )}
        {soleOwner?.success && (
          <Banner tone="error">
            <p>You are the only owner of these senders. Transfer ownership or delete them first:</p>
            <ul className="mt-2 list-disc pl-5">
              {soleOwner.data.orgs.map((o) => (
                <li key={o.id}>
                  <Link to={`/orgs/${encodeURIComponent(o.id)}/team`} className={linkClass}>
                    {o.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Banner>
        )}
        {reauth && (
          <div className="space-y-2">
            <Banner tone="error">Sign in with Google again to confirm</Banner>
            <GoogleButton next="/account" />
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              After signing in, press Delete account again.
            </p>
          </div>
        )}
        {err && !soleOwner && !reauth && <Banner tone="error">{friendlyMessage(err)}</Banner>}
        <Button
          type="submit"
          variant="danger"
          loading={del.isPending}
          disabled={me.has_password && password === ''}
        >
          Delete account
        </Button>
      </form>
    </Section>
  )
}

export function AccountPage() {
  const me = useMe()
  if (me.isPending) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }
  if (me.isError) {
    return <ErrorState message={friendlyMessage(me.error)} onRetry={() => void me.refetch()} />
  }
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Account</h1>
      <ProfileSection key={me.data.id} me={me.data} />
      <MfaSection me={me.data} />
      <EmailSection me={me.data} />
      <SessionsSection />
      <DeleteSection me={me.data} />
    </div>
  )
}
