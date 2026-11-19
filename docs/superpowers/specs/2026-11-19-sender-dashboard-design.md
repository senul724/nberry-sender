# nBerry sender dashboard: design

Approved by the user 2026-11-19. Source brief: `nberry-vibe/docs/prompts/sender-dashboard-web.md` (copied below, minus its hand-off line). Backend: `/Users/senul/projects/nberry-vibe` (`github.com/senul724/nberry-server-revamped`), which is the source of truth for every endpoint.


Build the **sender dashboard** for **Notify Berry (nBerry)**, a web app for businesses ("senders") that push notifications to their customers through the nBerry mobile app. The Go backend already exists and is the source of truth. Do not invent endpoints. If something you need isn't listed here, stop and tell me instead of faking it. If you can read the backend repo (`github.com/senul724/nberry-server-revamped`), check `docs/superpowers/specs/2026-11-18-nberry-backend-design.md` and the handlers under `internal/` when this brief is unclear.

## Product in one paragraph
A user signs up, creates a sender organization ("org") and becomes its owner. Customers follow the org by scanning its **broadcast QR code** in the nBerry app, and the org can then **broadcast** to all of them. For one-to-one messages, the org's own server creates an **invite**. The customer scans it, and nBerry calls the org's **callback URL** with an opaque `recipient_id`, which the org uses to send **unicast** messages. Senders never see a customer's email, account or device. The dashboard covers setup, monitoring and team management. **Unicast messages are sent only from the sender's own server, using API keys. Broadcasts can also be composed in the dashboard (see "Compose").**

## Stack (decided)
- Vite + React 19 + TypeScript (strict), Tailwind CSS v4 (`@tailwindcss/vite`), React Router, TanStack Query for server state, zod to validate responses at the API boundary, `qrcode` for QR rendering.
- Testing: Vitest + Testing Library + MSW (mock the API from the shapes below).
- pnpm, ESLint, Prettier. Config through `VITE_API_BASE_URL` (default: same origin) and `VITE_LINK_BASE_URL` (default `https://nberry.app`). The QR/invite link base must match the backend's `PUBLIC_LINK_BASE_URL`.
- The Google Sign-In client ID comes from `VITE_GOOGLE_CLIENT_ID`; it must be listed in the backend's `GOOGLE_CLIENT_IDS`.

## Auth (web mode: cookies + CSRF). Read this carefully
- Every login/refresh body includes `"client": "web"`. Tokens are **never** in JS: the backend sets cookies:
  - `nb_access` (HttpOnly, Path=/);
  - `nb_refresh` (HttpOnly, SameSite=Strict, Path=/v1/auth);
  - `nb_csrf` (readable).
- The login/refresh response body is `{session_id, access_expires_at, csrf_token}`.
- Every non-GET request must send the header `X-CSRF-Token: <nb_csrf value>`, plus `credentials: "include"` and `Content-Type: application/json` (other content types → 415). The only exception is the raw logo upload below.
- **Deploy same-origin.** In dev, proxy `/v1` to the backend (`http://localhost:8080`) with Vite's `server.proxy`. In prod, route `/v1/*` on the dashboard host to the API. That way, JS can read the `nb_csrf` cookie after a page reload, and `nb_refresh`'s path works. Read the CSRF value from `document.cookie` (fall back to the last `csrf_token` from a response). For local http, the backend needs `ENV=dev COOKIE_SECURE=false`, and `WEB_ORIGINS` should include the dashboard origin.
- Access tokens last 15 minutes:
  - On a `401`, call `POST /v1/auth/refresh {client:"web"}` **once (single-flight: concurrent 401s share one refresh)**, then retry the original request.
  - A `409 refresh_race` means another tab just refreshed: wait ~300 ms and retry the request.
  - If refresh fails with `invalid_refresh_token` or `refresh_reused`, clear state and go to login.
- Login flows (all public):
  - `POST /v1/auth/signup {email,password,name}` → `{status:"check_email"}` → `POST /v1/auth/verify-email {email,code}` (6 digits). Also `POST /v1/auth/resend-verification {email}`.
  - `POST /v1/auth/login {email,password,client:"web",device:{name,platform}}` → tokens, **or** `{mfa_required:true, mfa_token}`, which means: show a code screen → `POST /v1/auth/mfa/verify {mfa_token,code,client:"web",device}`.
  - `POST /v1/auth/google {id_token,client:"web",device}`, using the Google Identity Services button.
  - `POST /v1/auth/password/forgot {email}` → `POST /v1/auth/password/reset {email,code,new_password}`. A reset logs out every session.
  - `POST /v1/auth/logout` → 204.
  - Responses never reveal whether an email exists. Mirror that: always show "If that account exists, we've sent a code".
- `GET /v1/me` → `{id,email,name,mfa_enabled,has_password,is_admin,created_at}`.

## Errors and pagination
- Every error is `{error:{code,message}}`. Map these codes to friendly UI text:
  - `invalid_credentials`, `email_not_verified`, `weak_password`, `rate_limited`, `csrf_failed`, `server_busy` (503 on login/sign-up/password checks under load: "Busy, try again in a moment", safe to retry);
  - `reauth_required`, `org_not_verified`, `org_suspended`, `too_many_orgs`, `too_many_keys`;
  - `already_member`, `user_not_found`, `last_owner`, `sole_owner`, `confirm_mismatch`;
  - `invalid_callback_url`, `invalid_image`, `too_large`, `storage_not_configured`.
- Show `message` as a fallback for unknown codes.
- Lists are cursor-paginated: pass `?cursor=&limit=` and read `next_cursor` (null = end). Use "Load more", not page numbers.

## Org model and roles
- Org JSON: `{id,name,description,website,logo_url,status,broadcast_code,callback_url,send_rate_per_sec,my_role,created_at}`.
- `status` is `verified`, `pending` or `suspended`. Show a ✓ badge for verified. For pending/suspended, show a banner saying sends are blocked.
- Roles:
  - `owner`: everything, including members and deleting the org;
  - `admin`: settings, keys, sending;
  - `developer`: keys and sending.
- Hide controls by `my_role`, but still handle a 403/404 from the server.

## Screens
1. **Auth:** sign up, verify email, log in, MFA code, Google, forgot/reset.
2. **Org switcher + create org:** `GET /v1/orgs` → `{orgs:[Org]}`; `POST /v1/orgs {name,description?,website?,callback_url?}` → 201 Org. A user with no orgs lands on "Create your first sender".
3. **Overview:** `GET /v1/orgs/{id}/stats` → `{subscriber_count,messages_queued,messages_sent,messages_failed,links_active}`. Show stat tiles and a "Get started" checklist: logo, callback URL, API key, print QR.
4. **Broadcast QR:**
   - Render a QR for `${LINK_BASE}/s/${broadcast_code}` with the org logo in the center, downloadable as PNG and SVG, plus a printable A5 poster.
   - "Regenerate code": `POST /v1/orgs/{id}/broadcast-code` → Org. Warn first: old printed QR codes stop working, but subscribers are kept.
5. **Settings** (owner/admin):
   - `PATCH /v1/orgs/{id}` with any of `{name,description,website,callback_url}`.
   - Logo: `PUT /v1/orgs/{id}/logo` with the **raw file as the body** and `Content-Type: image/png|image/jpeg|image/webp`, max 1 MiB. Validate client-side and show a crop/preview. `DELETE /v1/orgs/{id}/logo` removes it.
   - Callback signing secret, kept behind a reveal click and never cached by TanStack Query:
     - `GET /v1/orgs/{id}/callback-secret` → `{callback_secret}`;
     - rotate: `POST` (same response). Confirm first, because the sender's server must update.
6. **API keys:**
   - `GET /v1/orgs/{id}/api-keys` → `{api_keys:[{id,name,prefix,created_by,created_at,last_used_at,revoked_at}]}`.
   - Create: `POST {name}` → 201, including `key` (`nb_live_…`). **Show the key once**, with a copy button and a "you won't see this again" warning, then drop it from memory.
   - Revoke: `DELETE …/api-keys/{keyId}`.
7. **Messages:** `GET /v1/orgs/{id}/messages` → `{messages:[{id,kind,title,body,status,failure_reason?,created_at,sent_at,source,sent_by}],next_cursor}`. `kind` is broadcast or unicast. `source` is `api` or `dashboard`; `sent_by` is `{user_id,name}` for a dashboard send, or `null` for an API send or when the sender's account was deleted. `sent_by.name` can be an empty string: then show "A team member", never the email. Show a status pill, a "Sent from" column (API / the sender's name) and a filterable table.
8. **Linked customers:** `GET /v1/orgs/{id}/links?callback_failed=true|false` → `{links:[{recipient_id,customer_ref,status,created_at,revoked_at,callback_failed_at}],next_cursor}`. Highlight rows whose callback failed, and explain that their server can recover them via `GET /v1/send/links?customer_ref=`.
9. **Team** (owner manages; others view):
   - `GET …/members` → `{members:[{user_id,email,name,role,joined_at}]}`;
   - add: `POST {email,role}`, where role is `admin`/`developer` (an owner is made by changing an existing member's role). Only people who already have a verified nBerry account can be added; on `404 user_not_found` say "Ask them to create an nBerry account first, then add them again". There are no email invites for unregistered people;
   - change: `PATCH …/members/{userId} {role}` (this is how to make someone an `owner`);
   - remove: `DELETE …/members/{userId}`.
10. **Developers:**
    - A static docs page with copy-paste `curl` and Node examples for the sender API, all using `Authorization: Bearer nb_live_…`:
      - `POST /v1/send/broadcasts {title,body,data?,idempotency_key?}` → 202 `{message_id,status}`;
      - `POST /v1/send/invites {customer_ref, expires_in?}` → `{invite_id,invite_token,invite_url,expires_at}`;
      - `GET /v1/send/invites/{invite_id}`;
      - `POST /v1/send/messages {recipient_id,title,body,data?,idempotency_key?}`;
      - `GET /v1/send/messages/{id}`, `GET /v1/send/broadcasts/{id}`;
      - `GET /v1/send/links?customer_ref=`, `DELETE /v1/send/links/{recipient_id}`.
    - Limits:
      - title 1–200 chars, body 1–2000;
      - `data` is a flat string map with up to 30 keys matching `[A-Za-z0-9_.-]`, ≤64 chars each; reserved keys are `message_id, org_id, kind, from, notification, message_type`;
      - the total payload is ≤3500 bytes;
      - 100 broadcasts/hour per org; 60 messages/hour per link.
    - Callback verification snippet:
      - events `link.created` / `link.revoked`, with body `{event,customer_ref,recipient_id,created_at}`;
      - header `nBerry-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, t + "." + rawBody)>` and `nBerry-Event-Id`;
      - retried for ~23 h; order is not guaranteed.
11. **Danger zone** (owner): delete the org with `DELETE /v1/orgs/{id} {confirm_name}`, where the user must type the org name.
12. **Account:**
    - `PATCH /v1/me {name}`;
    - 2FA: `PUT /v1/me/2fa {enabled,password}`;
    - email change: `POST /v1/me/email {new_email,password}` → `POST /v1/me/email/confirm {code}`;
    - sessions: `GET /v1/me/sessions` → `{sessions:[{id,client,device_name,platform,ip,created_at,last_used_at,current}]}`. Revoke one with `DELETE /v1/me/sessions/{id}` or all with `DELETE /v1/me/sessions`.
    - Delete account: `DELETE /v1/me {password}`. A `409 sole_owner` comes with `orgs:[{id,name}]`; list them and link to each. A Google-only account gets `403 reauth_required`; prompt a fresh Google sign-in and retry.
13. **Admin** (only if `me.is_admin`): an org-ID form with two controls:
    - `PUT /v1/admin/orgs/{id}/status {status}`;
    - `PUT /v1/admin/orgs/{id}/send-rate {send_rate_per_sec: 1..1000}`.

14. **Compose** (any member; broadcasts only): a form with `title` (1-200 chars), `body` (1-2000 chars) and an optional key/value editor for `data`.
    - Send with `POST /v1/orgs/{id}/broadcasts {title,body,data?,idempotency_key}` → 202 `{message_id,status}`. This is the user's session (cookie + CSRF), **never an API key**, which must not live in a browser.
    - Generate a fresh `idempotency_key` (a UUID) **once per compose attempt**, when the form opens or after a successful send, and reuse it on every retry or double-click of that attempt, so the message can't be sent twice. A replay returns the same `message_id`; the same key with edited content is `409 idempotency_conflict` (tell the user to start a new message).
    - The same limit as the API applies: **100 broadcasts per hour per org, shared with the sender's servers**. On `429 rate_limited` say the org's hourly limit was reached.
    - Errors: `403 org_not_verified` / `org_suspended` (show the org status banner), `404` (the user was removed from the org), `400 invalid_request|invalid_data|payload_too_large` (show the message; title, body and data together are at most 3500 bytes).
    - After a send, link to the Messages table, where the new row shows `source: "dashboard"` and the sender's name. Unicast stays API-only.

## Not in scope (don't build)
- A unicast compose form: unicast needs the recipient ids that only the sender's server holds.
- Billing, analytics beyond the stats above, a public marketing site.

## Quality bar
- Accessible (keyboard, focus rings, labels, contrast), responsive down to 360 px, dark mode via Tailwind's `dark:`. Every query has loading, empty and error states.
- One typed `api.ts` client with zod schemas per endpoint. No `any`.
- Tests:
  - the refresh single-flight and the 409 retry;
  - the CSRF header on mutations;
  - MFA branching;
  - the API key being shown once;
  - the org-delete name confirm;
  - role-based hiding.
- Write a README with dev setup: run the backend locally, set the Vite proxy, and set `COOKIE_SECURE=false` and `WEB_ORIGINS`.


## Approved route map (user, 2026-11-19)
```
/login  /signup  /verify-email  /mfa  /forgot  /reset        public
/                        → first org, or "Create your first sender"
/orgs/new                create org
/orgs/:orgId             Overview (stats + "Get started" checklist)
  /compose               Compose broadcast            (any member)
  /messages              Messages table, Load more    (any member)
  /qr                    QR, PNG/SVG, A5 poster, regenerate
  /customers             Linked customers
  /api-keys              API keys (show-once key)
  /team                  Team (owner edits, others view)
  /settings              details, logo, callback URL + secret   (owner/admin)
  /settings/danger       delete org by typing its name          (owner)
  /developers            API docs + callback signature snippet
/account                 profile, 2FA, email change, sessions, delete account
/admin                   org status / send rate        (me.is_admin only)
```
`GET /v1/orgs/{id}` → Org exists (not in the brief) and loads an org by URL (refresh, bookmark).

## Code layout
```
src/
  api/        client.ts (credentials, CSRF header, single-flight refresh on 401, 409 refresh_race retry)
              schemas.ts (zod per endpoint), errors.ts (code → friendly copy)
  auth/       session hook, route guard, Google button
  orgs/       org switcher, current-org context, useRole
  features/   one folder per screen, each with its TanStack Query hooks
  ui/         Button, Field, Dialog, Table, StatTile, StatusPill, Banner, CopyField, LoadMore
```

## Look (Claude's call, accepted)
Clean neutral (white/zinc) with one berry-purple accent; left sidebar on desktop, a menu on phones (≥360 px); dark mode via Tailwind `dark:`.

## Approaches
- **Chosen: Vite SPA, same-origin with the API** (Vite `server.proxy` for `/v1` in dev; the prod host routes `/v1/*` to the API). Needed so JS can read `nb_csrf` after a reload and `nb_refresh` (Path=/v1/auth) is sent.
- Rejected: cross-origin SPA (CSRF cookie unreadable after reload; refresh cookie path breaks); Next.js/SSR (the brief fixes Vite, and server rendering adds nothing to a logged-in dashboard).
