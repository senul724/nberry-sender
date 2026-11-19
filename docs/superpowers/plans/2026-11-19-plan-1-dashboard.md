# nBerry Sender Dashboard — Plan 1 (whole dashboard)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the nBerry sender web dashboard described in the design doc: auth, org management, compose, messages, QR, settings, keys, team, account and admin.

**Architecture:**
- A Vite React SPA served same-origin with the Go API (dev: Vite proxies `/v1` to `http://localhost:8080`).
- One typed fetch client (`src/api/client.ts`) owns cookies, CSRF, single-flight refresh and error parsing. Every response is parsed by a zod schema in `src/api/schemas.ts`.
- Screens live in `src/features/<screen>/`, each with its own TanStack Query hooks. Shared primitives live in `src/ui/`.

**Tech Stack:** Vite, React 19, TypeScript strict, Tailwind CSS v4 (`@tailwindcss/vite`), React Router (v7, data router), TanStack Query v5, zod, `qrcode`, Vitest + Testing Library + MSW v2, pnpm, ESLint (flat config), Prettier.

**Spec:** `docs/superpowers/specs/2026-11-19-sender-dashboard-design.md`. It is binding: endpoint paths, shapes, error codes, copy rules, the route map, the code layout and the look. The backend at `/Users/senul/projects/nberry-vibe` is the source of truth when the spec is unclear; read its handlers under `internal/`. **Never invent an endpoint.**

## Global Constraints
- Repo `/Users/senul/projects/nberry-sender`. Use pnpm (`pnpm` is on PATH, v12). Use the latest stable versions at install time; commit `pnpm-lock.yaml`.
- TypeScript `strict: true`. No `any`: not explicit, not via `as any`, and no `@ts-ignore`. ESLint must pass with 0 warnings.
- Scripts that must exist and pass at the end of every task:
  - `pnpm typecheck` (`tsc -b` or `tsc --noEmit`);
  - `pnpm lint`;
  - `pnpm test` (`vitest run`);
  - `pnpm build`.
- **All HTTP goes through `src/api/client.ts`.** No `fetch` elsewhere. Every request uses `credentials: "include"`. Each request body is JSON with `Content-Type: application/json`, except the logo upload, which is the raw file with its own `Content-Type`.
- **CSRF:** every non-GET request (including `POST /v1/auth/refresh`, `/v1/auth/logout` and the logo `PUT`) sends `X-CSRF-Token`.
  - Its value is read from the `nb_csrf` cookie in `document.cookie`, falling back to the last `csrf_token` seen in a login/refresh/MFA/Google response body.
  - GET requests never send it.
- **Refresh:** on a 401 from any request except the auth endpoints themselves:
  1. call `POST /v1/auth/refresh {client:"web"}` **once**; concurrent 401s await the same promise;
  2. then retry the original request once.
  - A `409 refresh_race` → wait 300 ms and retry the original request (no second refresh call from this tab).
  - `invalid_refresh_token` / `refresh_reused` / a 401 from refresh → clear the query cache and session state, and navigate to `/login`.
- Login, MFA, Google and refresh bodies include `client: "web"`. Login, MFA and Google include `device: {name, platform: "web"}`, where `name` is a short browser/OS label (e.g. "Chrome on macOS", ≤100 chars).
- Errors are `{error:{code,message}}` → an `ApiError {status, code, message, body}` class. `src/api/errors.ts` maps every code listed in the spec's "Errors and pagination" section (plus `idempotency_conflict`, `invalid_request`, `invalid_data`, `payload_too_large`, `already_member`, `member_not_found`, `refresh_race`, `not_found`) to friendly copy, falling back to `message`.
- Responses about email existence stay neutral: "If that account exists, we've sent a code".
- Never log or persist tokens, the CSRF value, API keys or the callback secret.
  - No `localStorage` / `sessionStorage` for any of them.
  - A created API key and a revealed callback secret live only in component state, never in the TanStack Query cache.
- Config: `VITE_API_BASE_URL` (default `""` = same origin), `VITE_LINK_BASE_URL` (default `https://nberry.app`, trailing slash stripped), `VITE_GOOGLE_CLIENT_ID` (when unset, hide the Google button). Read them only in `src/config.ts`.
- **Look:**
  - neutral white/zinc surfaces with one berry-purple accent (define it once as a Tailwind v4 `@theme` colour, e.g. `--color-berry-*`);
  - left sidebar on ≥md, a menu button + drawer below md;
  - works at 360 px wide with no horizontal scroll;
  - dark mode via `dark:` following `prefers-color-scheme`.
- **Accessibility:**
  - every input has a `<label>`;
  - visible focus rings;
  - dialogs trap focus and close on Escape;
  - tests query by role/label (Testing Library), not by test ids, where possible.
- Every query renders loading, empty and error states.
- Lists use "Load more" with `?cursor=&limit=` (`next_cursor` null = end).
- **Tests:**
  - MSW handlers live in `src/test/handlers.ts`, built from the spec's shapes;
  - `src/test/render.tsx` provides `renderWithProviders(ui, {route, session})` with a fresh QueryClient (`retry:false`) per test;
  - `onUnhandledRequest: "error"`.
- Commit after each task with a conventional-commit message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **Two tabs, or many parallel queries, hit an expired access token at once:** exactly one `/v1/auth/refresh` call per tab, every original request retried once, and no logout. (Task 2 tests.)
2. **A page reload with an expired access cookie:** `GET /v1/me` → 401 → refresh with the CSRF value read from the cookie → the user stays logged in. (Task 2 + Task 3 guard test.)
3. **A double-click or retry on Compose's Send:** the same `idempotency_key` is reused, so one message is sent. A new key is generated only after a success or "Start a new message". (Task 5.)
4. **A developer or admin opens an owner-only URL directly** (e.g. `/orgs/:id/settings/danger`): they see a "You don't have access" state, not a broken form. A 403/404 from the server is shown, not swallowed. (Task 4 role tests + Task 7.)
5. **Secrets leaking into caches:** a created API key or a revealed callback secret is never in the QueryClient cache and disappears when the dialog closes or you navigate away. (Task 6 tests.)

---

### Task 1: Project scaffold, UI primitives, test harness

**Files:** Create the Vite project in the repo root (keep the existing `CLAUDE.md`, `memory.md`, `docs/`, `.gitignore`). Add:
- `vite.config.ts`, with `server.proxy` `/v1` → `http://localhost:8080` (`changeOrigin: false`, so cookies stay same-origin) and a Vitest `test` block (jsdom, `src/test/setup.ts`);
- `src/config.ts`, `src/main.tsx`, `src/App.tsx`, `src/index.css` (Tailwind v4 `@import "tailwindcss"` + `@theme` berry colours);
- `src/ui/`: `Button`, `Field` (label + input + error), `TextArea`, `Select`, `Dialog`, `Banner`, `StatTile`, `StatusPill`, `Table`, `CopyField`, `LoadMore`, `Spinner`, `EmptyState`, `ErrorState`;
- `src/test/setup.ts`, `src/test/server.ts` (MSW node server), `src/test/handlers.ts` (empty array for now), `src/test/render.tsx`;
- `.prettierrc`, `eslint.config.js`, `.env.example`;
- `README.md` with dev setup:
  - run the backend with `ENV=dev COOKIE_SECURE=false WEB_ORIGINS=http://localhost:5173`;
  - `pnpm dev`;
  - production must route `/v1/*` on the dashboard host to the API;
  - the env vars.
- Update `memory.md` "How to Run".

- [ ] **Step 1:** Scaffold with `pnpm create vite@latest . --template react-ts` (or the equivalent in an empty temp dir, then move the files in), install deps, and wire Tailwind v4, Vitest, MSW, ESLint and Prettier.
- [ ] **Step 2: Failing tests** in `src/ui/ui.test.tsx`:
  - `Dialog` closes on Escape and returns focus to the trigger;
  - `CopyField` copies its value via `navigator.clipboard.writeText` and shows "Copied";
  - `Field` links its label to its input (`getByLabelText` works) and renders its error with `aria-invalid`;
  - `config.ts` strips a trailing slash from `VITE_LINK_BASE_URL` and defaults it to `https://nberry.app`.
- [ ] **Step 3:** Implement the primitives until the tests pass.
- [ ] **Step 4:** Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, all green.
- [ ] **Step 5:** Commit `chore: scaffold Vite + React + Tailwind dashboard with UI primitives and test harness`.

### Task 2: API client, errors, schemas

**Files:**
- `src/api/client.ts`: `api.get/post/patch/put/delete<T>(path, {body?, schema, signal?, rawBody?, contentType?})`; `setSessionExpiredHandler(fn)`; `rememberCsrf(token)`.
- `src/api/errors.ts`: the `ApiError` class and `friendlyMessage(err: unknown): string`.
- `src/api/schemas.ts`: zod schemas and inferred types for every response shape in the spec (Me, TokensWeb `{session_id, access_expires_at, csrf_token}`, MfaRequired, Org, OrgList, Stats, Message, MessageList, Link, LinkList, Member, ApiKey, ApiKeyCreated, CallbackSecret, Session, SoleOwner error body `{error, orgs}`, Send202 `{message_id,status}`).
- `src/api/client.test.ts`.

**Interfaces produced (later tasks rely on them):**
- `api.<method>(path: string, opts: {schema: z.ZodType<T>, body?: unknown, rawBody?: Blob, contentType?: string, signal?: AbortSignal}): Promise<T>`. A 204 resolves `undefined`: pass `z.undefined()` or use the `api.noContent` variant (implementer's choice, documented in a JSDoc).
- `ApiError` with `status: number`, `code: string`, `message: string`, `body: unknown`.
- `friendlyMessage(err)`.
- `setSessionExpiredHandler(() => void)`.
- `rememberCsrf(token: string)`: called by the auth hooks after a login/MFA/Google/refresh body.

- [ ] **Step 1: Failing tests** (`src/api/client.test.ts`, MSW):
  - `sends X-CSRF-Token from the nb_csrf cookie on POST/PATCH/PUT/DELETE and not on GET`;
  - `falls back to the remembered csrf_token when the cookie is absent`;
  - `sends credentials include and application/json; the logo PUT sends the raw blob with its own content type and the CSRF header`;
  - `parallel 401s trigger exactly one refresh, then each original request is retried once and resolves` (5 parallel GETs, a counter on the refresh handler = 1);
  - `refresh body is {client:"web"} and carries X-CSRF-Token`;
  - `409 refresh_race waits ~300ms and retries the original request without a second refresh` (fake timers or a measured delay);
  - `invalid_refresh_token from refresh calls the session-expired handler and rejects with ApiError` (also for `refresh_reused`);
  - `a 401 from /v1/auth/* endpoints is not refreshed` (login with bad credentials returns `ApiError` `invalid_credentials`, with 0 refresh calls);
  - `a non-JSON or schema-mismatched response rejects with a clear error, never returns unvalidated data`;
  - `friendlyMessage maps known codes and falls back to message`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run all four checks → PASS.
- [ ] **Step 5:** Commit `feat(api): typed client with CSRF, single-flight refresh and zod schemas`.

### Task 3: Auth screens and session

**Files:**
- `src/auth/session.tsx`: `useMe()` query on `GET /v1/me`; `SessionProvider` registers the session-expired handler (clear cache → `/login?next=`).
- `src/auth/RequireAuth.tsx`: the route guard (spinner while loading; redirect to `/login?next=<path>` on 401 after the refresh attempt).
- `src/auth/device.ts` (UA → "Chrome on macOS").
- `src/auth/GoogleButton.tsx`: loads `https://accounts.google.com/gsi/client` once, renders only when `VITE_GOOGLE_CLIENT_ID` is set, and posts `/v1/auth/google`.
- `src/features/auth/`: `LoginPage` (and the MFA step), `SignupPage`, `VerifyEmailPage` (+ resend), `ForgotPage`, `ResetPage`, `LogoutButton`.
- Router: `src/router.tsx` with the public routes of the route map plus a protected placeholder at `/`.

- [ ] **Step 1: Failing tests** (`src/features/auth/auth.test.tsx`):
  - `login without MFA stores csrf, invalidates me, and navigates to next or /`;
  - `login with mfa_required shows the 6-digit code step and posts mfa_token, code, client web and device to /v1/auth/mfa/verify`;
  - `invalid_credentials shows friendly copy and keeps the email`;
  - `email_not_verified offers a link to /verify-email prefilled with the email`;
  - `signup shows check-your-email and goes to /verify-email`;
  - `forgot always shows "If that account exists, we've sent a code"` (also on 404/429: show the rate-limit copy for 429);
  - `reset posts email, code, new_password, then sends to /login with a "signed out everywhere" note`;
  - `RequireAuth redirects to /login?next= when /v1/me and refresh both fail`;
  - `RequireAuth keeps the user in when /v1/me 401s once and refresh succeeds` (Review Focus 2);
  - `logout posts /v1/auth/logout, clears the cache and lands on /login`;
  - `Google button is not rendered without VITE_GOOGLE_CLIENT_ID`.
- [ ] **Steps 2–4:** FAIL → implement → all four checks PASS.
- [ ] **Step 5:** Commit `feat(auth): login, MFA, sign-up, verify, reset, Google and session guard`.

### Task 4: Org shell, roles, overview

**Files:**
- `src/orgs/`:
  - `useOrgs()` (`GET /v1/orgs`) and `useOrg(id)` (`GET /v1/orgs/{id}`);
  - `OrgProvider` / `useCurrentOrg()` from `:orgId`;
  - `useRole()` → `{role, can: {manageMembers, editSettings, manageKeys, send, deleteOrg}}`, where owner = all, admin = settings, keys and send, developer = keys and send;
  - `RequireRole` → a "You don't have access to this page" state;
  - `OrgSwitcher`, `StatusBanner` (pending/suspended: "Sending is blocked: this sender is <pending verification|suspended>"), `VerifiedBadge`.
- `src/layout/AppLayout.tsx`: sidebar/drawer with the nav for every org route in the map, items hidden by role; account and admin links (admin only if `me.is_admin`); dark mode.
- `src/features/orgs/CreateOrgPage.tsx`: `POST /v1/orgs`, showing `too_many_orgs` / `invalid_callback_url`.
- `/` index: redirect to the first org, or the "Create your first sender" empty state.
- `src/features/overview/OverviewPage.tsx`: stat tiles from `/stats`, plus a "Get started" checklist (logo set, callback URL set, at least one active API key, "Print your QR" link). Each item links to its page.

- [ ] **Step 1: Failing tests:**
  - `a user with no orgs sees "Create your first sender" and creating one navigates to /orgs/:id`;
  - `index redirects to the first org`;
  - `developer: nav hides Team-manage, Settings and Danger; shows Compose, Messages, QR, Customers, API keys, Developers`;
  - `admin: hides Danger zone and member editing`;
  - `owner: sees everything`;
  - `a developer opening /orgs/:id/settings/danger directly sees the no-access state` (Review Focus 4);
  - `pending and suspended orgs show the status banner; verified shows the ✓ badge`;
  - `overview renders the stat values and checklist states from the API`;
  - `useOrg 404 shows "Sender not found" with a link home`.
- [ ] **Steps 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(orgs): org shell, switcher, role-gated nav and overview`.

### Task 5: Compose and Messages

**Files:** `src/features/compose/ComposePage.tsx` (+ `DataEditor` key/value rows), `src/features/messages/MessagesPage.tsx`.

- **Compose:**
  - Client-side validation per the spec: title 1–200, body 1–2000; data keys `[A-Za-z0-9_.-]` ≤64 chars, ≤30 keys, no reserved keys (`message_id, org_id, kind, from, notification, message_type`), plus no keys starting with `google`/`gcm` in any case (the backend rejects those); a live byte counter for title + body + data ≤3500 (UTF-8 bytes, approximate is fine, labelled "about").
  - `idempotency_key = crypto.randomUUID()` is created when the form mounts, reused for every submit until a success, then regenerated. "Start a new message" also regenerates it.
  - The Send button is disabled while pending.
  - On 202, show "Broadcast queued", a link to Messages, and invalidate the messages and stats queries.
  - Errors:
    - `409 idempotency_conflict` → "This message was already sent with different content. Start a new message.";
    - `429` → "Your org reached its limit of 100 broadcasts per hour (shared with your servers).";
    - 403 org status → the status banner copy;
    - `404` → "You're no longer a member of this sender".
- **Messages:**
  - Table with columns: title, kind, status pill, "Sent from" (`source=api` → "API"; `dashboard` → `sent_by.name`, or "A team member" when the name is empty or `sent_by` is null), created/sent times, failure_reason.
  - Client-side filters by kind and status on the loaded rows; Load more.

- [ ] **Step 1: Failing tests:**
  - `double-click Send posts once while pending`;
  - `a failed send (500) then retry reuses the same idempotency_key`;
  - `after a successful send the next send uses a new key`;
  - `409 idempotency_conflict shows the start-new message and Start new regenerates the key`;
  - `429 shows the shared hourly limit copy`;
  - `reserved and google-prefixed data keys are rejected client-side`;
  - `messages "Sent from": API, a named sender, "A team member" for an empty name, "A team member" for null sent_by on a dashboard row`;
  - `Load more appends the next page and hides when next_cursor is null`.
- [ ] **Steps 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(compose): dashboard broadcast compose and messages table`.

### Task 6: QR, Settings, API keys

**Files:** `src/features/qr/QrPage.tsx`, `src/features/settings/SettingsPage.tsx` (details, logo, callback URL, callback secret), `src/features/apikeys/ApiKeysPage.tsx`.

- **QR:**
  - `qrcode` renders `${LINK_BASE}/s/${broadcast_code}` with the logo centred (error correction `H`);
  - download as PNG and SVG; "Print poster" opens an A5 print layout (`@page { size: A5 }`) with the org name, logo, QR and "Scan with nBerry to follow";
  - "Regenerate code" sits behind a confirm dialog that warns old printed codes stop working and subscribers stay; it calls `POST /v1/orgs/{id}/broadcast-code` and updates the org cache.
- **Settings** (requires `editSettings`):
  - `PATCH` only the changed fields.
  - Logo: accept png/jpeg/webp ≤1 MiB, validated client-side; preview before upload; `PUT` raw; `DELETE` to remove. A server `invalid_image` / `too_large` / `storage_not_configured` → friendly copy. A square centre-crop preview is enough; no crop editor.
  - Callback secret:
    - a "Reveal" button fetches via `api.get` **outside TanStack Query** (or `useMutation`, which isn't cached) and shows it in a `CopyField`;
    - "Rotate" sits behind a confirm warning that the sender's server must update;
    - the secret is cleared on hide or unmount.
- **API keys** (requires `manageKeys`):
  - List: name, prefix, created_by, created, last used, revoked.
  - Create dialog → 201: the key is shown once with a copy button and "You won't see this key again"; closing the dialog drops it from state.
  - Revoke has a confirm.
  - `too_many_keys` → friendly copy.

- [ ] **Step 1: Failing tests:**
  - `QR encodes ${LINK_BASE}/s/${code}` (spy on the qrcode call or decode the rendered data);
  - `regenerate requires confirm and updates the shown code`;
  - `settings PATCH sends only changed fields`;
  - `logo: rejects a gif and a >1 MiB file client-side; uploads png with Content-Type image/png and X-CSRF-Token`;
  - `callback secret is not in the QueryClient cache after reveal and is gone after hide` (inspect `queryClient.getQueryCache().getAll()`) (Review Focus 5);
  - `rotate requires confirm`;
  - `new API key is shown once, copyable, and absent after the dialog closes; never in the query cache` (Review Focus 5);
  - `revoke requires confirm and marks the key revoked`;
  - `developer sees API keys but not Settings`.
- [ ] **Steps 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(org): QR poster, settings, logo, callback secret and API keys`.

### Task 7: Team, Danger zone, Linked customers

**Files:** `src/features/team/TeamPage.tsx`, `src/features/danger/DangerPage.tsx`, `src/features/customers/CustomersPage.tsx`.

- **Team:**
  - Everyone sees the list.
  - Only owners (`manageMembers`) see add (email + role admin/developer), change role (owner/admin/developer) and remove.
  - `user_not_found` → "Ask them to create an nBerry account first, then add them again".
  - `already_member` and `last_owner` → friendly copy.
  - Removing yourself navigates home after success.
- **Danger zone** (owner): delete with `DELETE /v1/orgs/{id} {confirm_name}`. The button stays disabled until the typed name equals `org.name` exactly. On success, invalidate orgs and go to `/`. `confirm_mismatch` → copy.
- **Customers:**
  - Links table with a filter: all / callback failed (`?callback_failed=true`).
  - Rows with `callback_failed_at` are highlighted, with a help note: "Your server can recover these with `GET /v1/send/links?customer_ref=`".
  - Load more.

- [ ] **Step 1: Failing tests:**
  - `owner adds a member; user_not_found shows the create-account copy`;
  - `add-role select offers only admin and developer; change-role offers owner`;
  - `non-owner sees the member list without controls`;
  - `last_owner on demote shows friendly copy`;
  - `delete stays disabled until the exact name is typed and sends confirm_name`;
  - `customers callback_failed filter sends the query param and failed rows are highlighted`.
- [ ] **Steps 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(org): team, danger zone and linked customers`.

### Task 8: Developers, Account, Admin

**Files:** `src/features/developers/DevelopersPage.tsx`, `src/features/account/AccountPage.tsx`, `src/features/admin/AdminPage.tsx`.

- **Developers:** a static page with copy-paste `curl` and Node (fetch) examples for every `/v1/send/*` endpoint in the spec.
  - Use `Authorization: Bearer nb_live_…` placeholders, never a real key.
  - Include the limits, and the callback verification snippet in Node (HMAC-SHA256 over `t + "." + rawBody`, constant-time compare, a 5-minute timestamp tolerance, dedupe on `nBerry-Event-Id`).
  - Note that events may be retried for ~23 h and arrive out of order.
  - Each code block gets a copy button.
  - The API base shown is `window.location.origin`.
- **Account:**
  - profile name `PATCH /v1/me`;
  - 2FA toggle (`PUT /v1/me/2fa {enabled,password}`, which needs the password);
  - email change in two steps;
  - sessions list (current marked, revoke one; "Sign out everywhere else" = `DELETE /v1/me/sessions`);
  - delete account (`DELETE /v1/me {password}`):
    - `409 sole_owner` lists `orgs` with links to each org's Team page;
    - `403 reauth_required` → "Sign in with Google again to confirm", using the Google button, then retry.
- **Admin:** routed only when `me.is_admin`; others get the no-access state.
  - An org ID field with a status select (verified/pending/suspended) → `PUT /v1/admin/orgs/{id}/status`;
  - a send-rate number field, 1–1000 validated client-side → `PUT …/send-rate`;
  - shows the updated org.

- [ ] **Step 1: Failing tests:**
  - `developers page contains every /v1/send endpoint path from the spec and no real-looking key`;
  - `2FA toggle sends enabled and password`;
  - `email change: request then confirm code`;
  - `revoking a session removes it; current session has no revoke button`;
  - `delete account sole_owner lists the orgs with links`;
  - `delete account reauth_required shows the Google re-auth prompt`;
  - `admin route is no-access for non-admins`;
  - `send-rate rejects 0 and 1001 client-side and PUTs a valid value`.
- [ ] **Steps 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Update `README.md` (feature list) and `memory.md` (status, structure, session log).
- [ ] **Step 6:** Commit `feat: developers docs, account and admin pages`.
