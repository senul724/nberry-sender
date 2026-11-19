import { z } from 'zod'

const id = z.string()
const time = z.string() // RFC 3339

export const Me = z.object({
  id,
  email: z.string(),
  name: z.string(),
  mfa_enabled: z.boolean(),
  has_password: z.boolean(),
  is_admin: z.boolean(),
  created_at: time,
})
export type Me = z.infer<typeof Me>

/** Web-mode login / refresh / MFA / Google 200 body. */
export const TokensWeb = z.object({
  session_id: id,
  access_expires_at: time,
  csrf_token: z.string(),
})
export type TokensWeb = z.infer<typeof TokensWeb>

export const MfaRequired = z.object({ mfa_required: z.literal(true), mfa_token: z.string() })
export type MfaRequired = z.infer<typeof MfaRequired>

/** Login result: MFA challenge or tokens. */
export const LoginResponse = z.union([MfaRequired, TokensWeb])
export type LoginResponse = z.infer<typeof LoginResponse>

export const OrgStatus = z.enum(['verified', 'pending', 'suspended'])
export type OrgStatus = z.infer<typeof OrgStatus>
export const Role = z.enum(['owner', 'admin', 'developer'])
export type Role = z.infer<typeof Role>

export const Org = z.object({
  id,
  name: z.string(),
  description: z.string().nullish(),
  website: z.string().nullish(),
  logo_url: z.string().nullish(),
  status: OrgStatus,
  broadcast_code: z.string(),
  callback_url: z.string().nullish(),
  send_rate_per_sec: z.number(),
  my_role: Role,
  created_at: time,
})
export type Org = z.infer<typeof Org>

export const OrgList = z.object({ orgs: z.array(Org) })
export type OrgList = z.infer<typeof OrgList>

export const Stats = z.object({
  subscriber_count: z.number(),
  messages_queued: z.number(),
  messages_sent: z.number(),
  messages_failed: z.number(),
  links_active: z.number(),
})
export type Stats = z.infer<typeof Stats>

export const Message = z.object({
  id,
  kind: z.enum(['broadcast', 'unicast']),
  title: z.string(),
  body: z.string(),
  status: z.string(),
  failure_reason: z.string().nullish(),
  created_at: time,
  sent_at: time.nullish(),
  source: z.enum(['api', 'dashboard']),
  sent_by: z.object({ user_id: id, name: z.string() }).nullish(),
})
export type Message = z.infer<typeof Message>

export const MessageList = z.object({
  messages: z.array(Message),
  next_cursor: z.string().nullish(),
})
export type MessageList = z.infer<typeof MessageList>

export const Link = z.object({
  recipient_id: id,
  customer_ref: z.string(),
  status: z.string(),
  created_at: time,
  revoked_at: time.nullish(),
  callback_failed_at: time.nullish(),
})
export type Link = z.infer<typeof Link>

export const LinkList = z.object({ links: z.array(Link), next_cursor: z.string().nullish() })
export type LinkList = z.infer<typeof LinkList>

export const Member = z.object({
  user_id: id,
  email: z.string(),
  name: z.string(),
  role: Role,
  joined_at: time,
})
export type Member = z.infer<typeof Member>

export const MemberList = z.object({ members: z.array(Member) })
export type MemberList = z.infer<typeof MemberList>

export const ApiKey = z.object({
  id,
  name: z.string(),
  prefix: z.string(),
  created_by: id.nullish(),
  created_at: time,
  last_used_at: time.nullish(),
  revoked_at: time.nullish(),
})
export type ApiKey = z.infer<typeof ApiKey>

export const ApiKeyList = z.object({ api_keys: z.array(ApiKey) })
export type ApiKeyList = z.infer<typeof ApiKeyList>

/** Returned once on creation; `key` must never enter the query cache. */
export const ApiKeyCreated = ApiKey.extend({ key: z.string() })
export type ApiKeyCreated = z.infer<typeof ApiKeyCreated>

/** Must never enter the query cache. */
export const CallbackSecret = z.object({ callback_secret: z.string() })
export type CallbackSecret = z.infer<typeof CallbackSecret>

export const Session = z.object({
  id,
  client: z.string(),
  device_name: z.string().nullish(),
  platform: z.string().nullish(),
  ip: z.string().nullish(),
  created_at: time,
  last_used_at: time.nullish(),
  current: z.boolean(),
})
export type Session = z.infer<typeof Session>

export const SessionList = z.object({ sessions: z.array(Session) })
export type SessionList = z.infer<typeof SessionList>

/** 409 sole_owner: the error envelope plus the blocking orgs at the top level. */
export const SoleOwnerError = z.object({
  error: z.object({ code: z.string(), message: z.string().optional() }),
  orgs: z.array(z.object({ id, name: z.string() })),
})
export type SoleOwnerError = z.infer<typeof SoleOwnerError>

export const Send202 = z.object({ message_id: id, status: z.string() })
export type Send202 = z.infer<typeof Send202>
