import { z } from 'zod'

/** An error response from the nBerry API (or a client-side failure that looks like one). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly body: unknown

  constructor(status: number, code: string, message: string, body: unknown = undefined) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.body = body
  }
}

/** The backend's `{error:{code,message}}` envelope. */
export const errorEnvelope = z.object({
  error: z.object({ code: z.string(), message: z.string().optional() }),
})

const copy: Record<string, string> = {
  invalid_credentials: 'That email or password is incorrect.',
  email_not_verified: 'Verify your email address first. Check your inbox for the code.',
  weak_password: 'Choose a stronger password.',
  rate_limited: "You've hit a rate limit. Wait a bit and try again.",
  csrf_failed: 'Your session check failed. Reload the page and try again.',
  server_busy: 'Busy, try again in a moment.',
  reauth_required: 'Please sign in again to confirm it is you.',
  org_not_verified: "This sender isn't verified yet, so sending is blocked.",
  org_suspended: 'This sender is suspended, so sending is blocked.',
  too_many_orgs: "You've reached the maximum number of senders.",
  too_many_keys: "You've reached the maximum number of API keys.",
  already_member: 'That person is already on the team.',
  member_not_found: 'That team member no longer exists.',
  user_not_found: 'Ask them to create an nBerry account first, then add them again.',
  last_owner: 'An organization must keep at least one owner.',
  sole_owner: "You're the only owner of one or more senders. Transfer or delete them first.",
  confirm_mismatch: "That name doesn't match.",
  invalid_callback_url: 'That callback URL is not valid. Use a public https URL.',
  invalid_image: 'That image could not be used. Use a PNG, JPEG or WebP file.',
  too_large: 'That file is too large.',
  payload_too_large:
    'The message is too large. Title, body and data together can be at most 3500 bytes.',
  storage_not_configured: 'Image storage is not set up on this server.',
  idempotency_conflict:
    'This message was already sent with different content. Start a new message.',
  invalid_request: 'Some of the details are not valid. Check them and try again.',
  invalid_data: 'The extra data is not valid. Check the keys and values.',
  refresh_race: 'Your session was just refreshed. Try again.',
  not_found: "We couldn't find that. It may have been removed.",
  invalid_refresh_token: 'Your session has expired. Please sign in again.',
  refresh_reused: 'Your session has expired. Please sign in again.',
  network_error: "Can't reach nBerry. Check your connection and try again.",
  forbidden: "You don't have permission to do that.",
  unauthorized: 'Your session has expired. Please sign in again.',
  internal_error: 'Something went wrong on our side. Try again in a moment.',
  invalid_code: 'That code is incorrect or has expired. Request a new one.',
  invalid_mfa_token: 'That sign-in attempt has expired. Start again.',
  email_taken: 'That email address is already in use.',
  invalid_email: 'Enter a valid email address.',
  invalid_name: "That name isn't valid. Check its length and try again.",
  invalid_website: 'Enter a full website address starting with http:// or https://.',
  invalid_description: 'The description is too long. Keep it to 500 characters.',
  invalid_status: 'Choose a valid status.',
  password_required: 'This account has no password, so that is not available.',
  invalid_google_token: "We couldn't verify your Google sign-in. Try again.",
  google_not_configured: 'Google sign-in is not set up on this server.',
  deletion_conflict: 'Something changed while deleting. Please try again.',
  invalid_response: 'The server sent an unexpected response. Try again.',
}

/** Friendly UI copy for an error; unknown codes fall back to the server's message. */
export function friendlyMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return copy[err.code] ?? (err.message || 'Something went wrong. Please try again.')
  }
  if (err instanceof Error && err.message) return err.message
  return 'Something went wrong. Please try again.'
}
