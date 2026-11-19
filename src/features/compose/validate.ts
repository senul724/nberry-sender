/** Client-side mirror of the backend's broadcast validation (internal/messaging/broadcast.go). */

export const MAX_TITLE = 200
export const MAX_BODY = 2000
export const MAX_DATA_KEYS = 30
export const MAX_DATA_KEY_LEN = 64
export const MAX_PAYLOAD_BYTES = 3500

const RESERVED = new Set(['message_id', 'org_id', 'kind', 'from', 'notification', 'message_type'])
const KEY_RE = /^[A-Za-z0-9_.-]+$/

/** Unicode code points, as the server counts them (Go RuneCount). */
export const codePoints = (s: string) => [...s].length

/**
 * Control (Cc) and format (Cf) characters are rejected, except ZWNJ, ZWJ and the tag characters
 * that emoji and some scripts need. `allowWhitespace` lets a body keep newline and tab.
 */
export function hasControlChars(s: string, allowWhitespace: boolean): boolean {
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0
    if (allowWhitespace && (cp === 0x0a || cp === 0x09)) continue
    if (cp === 0x200c || cp === 0x200d || (cp >= 0xe0020 && cp <= 0xe007f)) continue
    if (/[\p{Cc}\p{Cf}]/u.test(ch)) return true
  }
  return false
}

export interface DataRow {
  id: string
  key: string
  value: string
}

/** Rows with neither key nor value are ignored (a blank row the user has not filled in). */
export const filledRows = (rows: DataRow[]) => rows.filter((r) => r.key !== '' || r.value !== '')

export function dataKeyError(key: string): string | undefined {
  if (key === '') return 'Enter a key'
  if (key.length > MAX_DATA_KEY_LEN) return `Keys can be at most ${MAX_DATA_KEY_LEN} characters`
  if (!KEY_RE.test(key)) return 'Use only letters, numbers, underscore, dot and hyphen'
  const lower = key.toLowerCase()
  if (RESERVED.has(key) || lower.startsWith('google') || lower.startsWith('gcm')) {
    return `"${key}" is reserved. Choose another key`
  }
  return undefined
}

export function dataToObject(rows: DataRow[]): Record<string, string> {
  return Object.fromEntries(filledRows(rows).map((r) => [r.key, r.value]))
}

/** About how many bytes the server will count: UTF-8 title + body + JSON of the data. */
export function payloadBytes(title: string, body: string, rows: DataRow[]): number {
  const enc = new TextEncoder()
  return (
    enc.encode(title).length +
    enc.encode(body).length +
    enc.encode(JSON.stringify(dataToObject(rows))).length
  )
}

export interface FormErrors {
  title?: string
  body?: string
  data?: string
  /** Row id -> message. */
  rows: Record<string, string>
}

export function validateForm(title: string, body: string, rows: DataRow[]): FormErrors {
  const errors: FormErrors = { rows: {} }
  const t = codePoints(title)
  if (t < 1 || t > MAX_TITLE) errors.title = `Title must be 1 to ${MAX_TITLE} characters`
  else if (hasControlChars(title, false)) errors.title = 'Title cannot contain control characters'
  const b = codePoints(body)
  if (b < 1 || b > MAX_BODY) errors.body = `Message must be 1 to ${MAX_BODY} characters`
  else if (hasControlChars(body, true)) errors.body = 'Message cannot contain control characters'

  const filled = filledRows(rows)
  if (filled.length > MAX_DATA_KEYS) errors.data = `At most ${MAX_DATA_KEYS} data keys`
  const seen = new Set<string>()
  for (const r of filled) {
    const e = dataKeyError(r.key)
    if (e) errors.rows[r.id] = e
    else if (seen.has(r.key)) errors.rows[r.id] = 'This key is used twice'
    seen.add(r.key)
  }
  if (!errors.title && !errors.body && !errors.data && Object.keys(errors.rows).length === 0) {
    if (payloadBytes(title, body, rows) > MAX_PAYLOAD_BYTES) {
      errors.data = `Title, message and data are too large (limit ${MAX_PAYLOAD_BYTES} bytes)`
    }
  }
  return errors
}

export const hasErrors = (e: FormErrors) =>
  !!e.title || !!e.body || !!e.data || Object.keys(e.rows).length > 0
