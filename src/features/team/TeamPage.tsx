import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { api } from '../../api/client'
import { friendlyMessage } from '../../api/errors'
import { Member, MemberList, type Role } from '../../api/schemas'
import { useMe } from '../../auth/session'
import { useCurrentOrg } from '../../orgs/context'
import { orgKey, orgsKey } from '../../orgs/queries'
import { useRole } from '../../orgs/roles'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { EmptyState } from '../../ui/EmptyState'
import { ErrorState } from '../../ui/ErrorState'
import { Field } from '../../ui/Field'
import { Select } from '../../ui/Select'
import { Spinner } from '../../ui/Spinner'
import { Table } from '../../ui/Table'

const undefinedSchema = z.undefined()
const fmt = (iso: string) => new Date(iso).toLocaleDateString()

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', developer: 'Developer' }
const CHANGE_ROLES: Role[] = ['owner', 'admin', 'developer']

function isRole(v: string): v is Role {
  return v === 'owner' || v === 'admin' || v === 'developer'
}

export function TeamPage() {
  const org = useCurrentOrg()
  const { can } = useRole()
  const me = useMe()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const base = `/v1/orgs/${encodeURIComponent(org.id)}/members`
  const listKey = ['orgs', org.id, 'members']

  const members = useQuery({
    queryKey: listKey,
    queryFn: () => api.get(base, { schema: MemberList }),
  })

  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | undefined>()
  const [addRole, setAddRole] = useState<'admin' | 'developer'>('developer')
  const [removing, setRemoving] = useState<Member | null>(null)

  const refreshOrg = () => {
    void queryClient.invalidateQueries({ queryKey: orgKey(org.id), exact: true })
    void queryClient.invalidateQueries({ queryKey: orgsKey, exact: true })
  }

  const add = useMutation({
    mutationFn: (v: { email: string; role: Role }) => api.post(base, { schema: Member, body: v }),
    onSuccess: async () => {
      setEmail('')
      await queryClient.invalidateQueries({ queryKey: listKey })
    },
  })

  const change = useMutation({
    mutationFn: (v: { member: Member; role: Role }) =>
      api.patch(`${base}/${encodeURIComponent(v.member.user_id)}`, {
        schema: Member,
        body: { role: v.role },
      }),
    onSuccess: async (_res, v) => {
      await queryClient.invalidateQueries({ queryKey: listKey })
      // Our own capabilities may have changed.
      if (v.member.user_id === me.data?.id) refreshOrg()
    },
  })

  const remove = useMutation({
    mutationFn: (m: Member) =>
      api.delete(`${base}/${encodeURIComponent(m.user_id)}`, { schema: undefinedSchema }),
    onSuccess: async (_res, m) => {
      setRemoving(null)
      if (m.user_id === me.data?.id) {
        // We left: go home first so nothing refetches this org, then drop its caches.
        navigate('/', { replace: true })
        queryClient.removeQueries({ queryKey: orgKey(org.id) })
        void queryClient.invalidateQueries({ queryKey: orgsKey })
        return
      }
      await queryClient.invalidateQueries({ queryKey: listKey })
    },
  })

  function submitAdd(e: FormEvent) {
    e.preventDefault()
    if (add.isPending) return
    const trimmed = email.trim()
    if (trimmed === '') {
      setEmailError('Enter their email address.')
      return
    }
    add.mutate({ email: trimmed, role: addRole })
  }

  const actionError = add.error ?? change.error ?? remove.error
  const resetErrors = () => {
    add.reset()
    change.reset()
    remove.reset()
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Team</h1>

      {can.manageMembers && (
        <form
          onSubmit={submitAdd}
          noValidate
          className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <h2 className="text-lg font-semibold">Add a team member</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            They need an nBerry account with a verified email first.
          </p>
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1 basis-56">
              <Field
                label="Email"
                type="email"
                autoComplete="off"
                value={email}
                error={emailError}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setEmailError(undefined)
                  add.reset()
                }}
              />
            </div>
            <Select
              label="Role"
              value={addRole}
              onChange={(e) => setAddRole(e.target.value === 'admin' ? 'admin' : 'developer')}
            >
              <option value="admin">Admin</option>
              <option value="developer">Developer</option>
            </Select>
          </div>
          <Button type="submit" loading={add.isPending}>
            Add member
          </Button>
        </form>
      )}

      {actionError && <Banner tone="error">{friendlyMessage(actionError)}</Banner>}

      {members.isPending && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
      {members.isError && (
        <ErrorState
          message={friendlyMessage(members.error)}
          onRetry={() => void members.refetch()}
        />
      )}
      {members.isSuccess && members.data.members.length === 0 && (
        <EmptyState title="No team members" />
      )}
      {members.isSuccess && members.data.members.length > 0 && (
        <Table
          caption="Team members"
          rows={members.data.members}
          rowKey={(m) => m.user_id}
          columns={[
            {
              header: 'Name',
              cell: (m) => (
                <span className="font-medium">
                  {m.name || m.email}
                  {m.user_id === me.data?.id ? ' (you)' : ''}
                </span>
              ),
            },
            { header: 'Email', cell: (m) => m.email },
            {
              header: 'Role',
              cell: (m) =>
                can.manageMembers ? (
                  <Select
                    label={`Role for ${m.email}`}
                    hideLabel
                    value={m.role}
                    disabled={change.isPending}
                    onChange={(e) => {
                      const role = e.target.value
                      if (!isRole(role)) return
                      resetErrors()
                      change.mutate({ member: m, role })
                    }}
                  >
                    {CHANGE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                ) : (
                  ROLE_LABEL[m.role]
                ),
            },
            { header: 'Joined', cell: (m) => fmt(m.joined_at) },
            ...(can.manageMembers
              ? [
                  {
                    header: 'Actions',
                    cell: (m: Member) => (
                      <Button
                        variant="secondary"
                        aria-label={`Remove ${m.email}`}
                        onClick={() => {
                          resetErrors()
                          setRemoving(m)
                        }}
                      >
                        Remove
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}

      <Dialog open={removing !== null} onClose={() => setRemoving(null)} title="Remove member?">
        <p className="text-sm">
          {removing?.user_id === me.data?.id
            ? `You will lose access to ${org.name}.`
            : `${removing?.email} will lose access to ${org.name}.`}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => removing && remove.mutate(removing)}
          >
            Remove
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
