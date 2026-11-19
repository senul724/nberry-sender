import type { OrgStatus } from '../api/schemas'
import { Banner } from '../ui/Banner'

/** Pending and suspended senders cannot send; verified shows nothing. */
export function StatusBanner({ status }: { status: OrgStatus }) {
  if (status === 'verified') return null
  const label = status === 'pending' ? 'pending verification' : 'suspended'
  return <Banner tone="warning">Sending is blocked: this sender is {label}</Banner>
}
