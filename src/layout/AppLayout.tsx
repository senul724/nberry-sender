import { useState } from 'react'
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom'
import { useMe } from '../auth/session'
import { LogoutButton } from '../features/auth/LogoutButton'
import { permissions } from '../orgs/roles'
import { OrgSwitcher } from '../orgs/OrgSwitcher'
import { useOrg } from '../orgs/queries'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { focusRing } from '../ui/focus'

interface NavItem {
  to: string
  label: string
  end?: boolean
}

function itemClass({ isActive }: { isActive: boolean }) {
  return cx(
    'block rounded-md px-3 py-2 text-sm font-medium',
    focusRing,
    isActive
      ? 'bg-berry-50 text-berry-800 dark:bg-berry-900/30 dark:text-berry-100'
      : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
  )
}

/** Shell for every signed-in page: sidebar on >=md, menu button + drawer below. */
export function AppLayout() {
  const { orgId } = useParams()
  const me = useMe()
  const org = useOrg(orgId)
  const { pathname } = useLocation()
  // The menu is open only for the pathname it was opened on, so any navigation closes it.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === pathname

  const base = `/orgs/${orgId}`
  const items: NavItem[] = []
  if (orgId && org.data) {
    const can = permissions(org.data.my_role)
    items.push(
      { to: base, label: 'Overview', end: true },
      { to: `${base}/compose`, label: 'Compose' },
      { to: `${base}/messages`, label: 'Messages' },
      { to: `${base}/qr`, label: 'QR' },
      { to: `${base}/customers`, label: 'Customers' },
      { to: `${base}/api-keys`, label: 'API keys' },
      { to: `${base}/team`, label: 'Team' },
    )
    if (can.editSettings) items.push({ to: `${base}/settings`, label: 'Settings', end: true })
    if (can.deleteOrg) items.push({ to: `${base}/settings/danger`, label: 'Danger zone' })
    items.push({ to: `${base}/developers`, label: 'Developers' })
  }
  const account: NavItem[] = [{ to: '/account', label: 'Account' }]
  if (me.data?.is_admin) account.push({ to: '/admin', label: 'Admin' })

  return (
    <div className="min-h-screen md:flex">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 md:hidden dark:border-zinc-800">
        <span className="font-semibold text-berry-700 dark:text-berry-300">nBerry</span>
        <Button
          variant="secondary"
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpenAt(open ? null : pathname)}
        >
          Menu
        </Button>
      </header>
      <aside
        className={cx(
          'w-full shrink-0 flex-col gap-6 border-b border-zinc-200 p-4 md:flex md:min-h-screen md:w-64 md:border-r md:border-b-0 dark:border-zinc-800',
          open ? 'flex' : 'hidden',
        )}
      >
        <p className="hidden text-lg font-semibold text-berry-700 md:block dark:text-berry-300">
          nBerry
        </p>
        <OrgSwitcher />
        <nav id="main-nav" aria-label="Main" className="flex-1 space-y-1">
          {[...items, ...account].map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={itemClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 text-sm">
          <p className="truncate text-zinc-500 dark:text-zinc-400">{me.data?.name}</p>
          <LogoutButton />
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}
