import type { OrgStatus } from '../api/schemas'
import { Banner } from '../ui/Banner'
import { sendingBlockedMessage } from './blockedCopy'

/** Pending and suspended senders cannot send; verified shows nothing. */
export function StatusBanner({ status }: { status: OrgStatus }) {
  if (status === 'verified') return null
  return <Banner tone="warning">{sendingBlockedMessage(status)}</Banner>
}
