import { useMe } from '../../auth/session'
import { LogoutButton } from '../auth/LogoutButton'

/** Placeholder until the org shell (Task 4) replaces it. */
export function HomePage() {
  const me = useMe()
  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Signed in as {me.data?.name}</h1>
      <LogoutButton />
    </main>
  )
}
