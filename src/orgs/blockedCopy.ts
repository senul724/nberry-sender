/** Banner copy for a pending or suspended sender (also used for 403 send errors). */
export function sendingBlockedMessage(status: 'pending' | 'suspended'): string {
  const label = status === 'pending' ? 'pending verification' : 'suspended'
  return `Sending is blocked: this sender is ${label}`
}
