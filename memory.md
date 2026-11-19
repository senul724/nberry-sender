# nBerry sender dashboard: project memory

## Overview
Web dashboard for nBerry senders (orgs): setup, compose broadcasts, messages, QR, API keys, team, account, admin.
- **Status:** Plan 1 (all screens) merged to main 2026-11-19 (16205cf); 197 tests green. No git remote yet (push pending a GitHub repo). Next: manual run against the real backend + browser QA (dialog focus trap, MFA, Google).
- Design: `docs/superpowers/specs/2026-11-19-sender-dashboard-design.md`. Plan: `docs/superpowers/plans/2026-11-19-plan-1-dashboard.md`.

## Tech Stack
Vite + React 19 + TypeScript strict, Tailwind v4 (`@tailwindcss/vite`), React Router, TanStack Query, zod, `qrcode`; Vitest + Testing Library + MSW; pnpm, ESLint, Prettier.

## Key Decisions
<!-- Format: - YYYY-MM-DD — decision — why -->
- 2026-11-19 — Separate repo `nberry-sender` next to the backend (user choice).
- 2026-11-19 — Same-origin deploy: Vite proxies `/v1` → `http://localhost:8080` in dev; prod host routes `/v1/*` to the API — JS must read `nb_csrf` after reload and `nb_refresh` has Path=/v1/auth.
- 2026-11-19 — Look: neutral white/zinc + one berry-purple accent, sidebar on desktop, menu on phones, dark mode (Claude's call, accepted).

- 2026-11-19 — Org shell: `/orgs/:orgId` is a layout route (`OrgProvider`) so loading/404 render inside the app shell; role gates via `RequireRole can="editSettings|deleteOrg|..."`; Team nav visible to all roles.
- 2026-11-19 — Login/Signup redirect to `next` or `/` only when `me` is already cached (`useSignedIn`, never fetches).

## Backend facts that shape the client
- Cookies: `nb_access` (HttpOnly, 15 min), `nb_refresh` (HttpOnly, Path=/v1/auth, 30 d), `nb_csrf` (readable, 30 d). Double-submit: `X-CSRF-Token` must equal the `nb_csrf` cookie on every non-GET, **including `POST /v1/auth/refresh`**.
- Refresh rotates every time; reuse of an old refresh token revokes the session → refresh must be single-flight.
- Refresh runs CSRF before reading the cookie: no `nb_csrf` → 403 `csrf_failed`, so the client skips refresh without a CSRF value and treats csrf_failed as session expiry. It refreshes only on 401 code `unauthorized`. `DELETE /v1/me/sessions` revokes ALL sessions (this one too). Admin endpoints return an Org without `my_role`.

## How to Run
- Backend: `ENV=dev COOKIE_SECURE=false WEB_ORIGINS=http://localhost:5173` (Go API on :8080).
- `pnpm install && pnpm dev` -> http://localhost:5173 (Vite proxies `/v1` to :8080).
- Checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- Env vars (only read in `src/config.ts`): `VITE_API_BASE_URL`, `VITE_LINK_BASE_URL`, `VITE_GOOGLE_CLIENT_ID`; see `.env.example` and README.
- Pins: TypeScript ~6.0 (typescript-eslint doesn't support TS 7 yet), MSW 2.x (brief/API: `onUnhandledRequest`; MSW 3 dropped it from `listen`).

## Current Focus / Next Steps
- [x] Tasks 1-8 done. Structure: one folder per screen under `src/features/*` (account, admin, developers, ...), shared UI in `src/ui`, org context in `src/orgs` (`dropOrg` clears a departed org's cache), API client in `src/api`.
- [x] Final review fix wave applied; merged to main (16205cf).
- [ ] Try it against the real backend (`pnpm dev`).

## Session Log
- 2026-11-19 — Merged Plan 1 (whole dashboard) to main; final review caught 5 backend-integration bugs (refresh 403 csrf_failed, admin my_role, sign-out-all, wrong-password refresh, stale org list), all fixed. No remote to push to yet.
- 2026-11-19 — Created repo, design doc and plan; started subagent-driven build.
- 2026-11-19 — Task 1: scaffolded Vite/Tailwind/Vitest/MSW, UI primitives in `src/ui`, test harness.
- 2026-11-19 — Tasks 3-4: auth screens, then org shell/roles/overview plus Task 3 review follow-ups.
- 2026-11-19 — Task 5: Compose (idempotency key per attempt, client validation mirroring backend) and Messages table; org outlet keyed by org id.
- 2026-11-19 — Decision: /admin gates itself on `me.is_admin` (AdminPage shows no-access); delete-account re-auth is a manual retry after Google sign-in (destructive action is never auto-retried).
- 2026-11-19: Task 7 done (Team, Danger zone, Customers) plus Task 6 follow-ups.
- 2026-11-19: Task 8 done (Developers docs, Account, Admin) plus follow-ups: Leave this sender, dropOrg, Added note, customers error test.
- 2026-11-19: Final-review fix wave: signed-out visitors reach /login (no refresh without CSRF; 403 csrf_failed = expiry), refresh only on 401 `unauthorized`, admin `AdminOrg` (no my_role), sign-out-everywhere confirms + clears session, dropOrg prunes the cached list, lazy route pages, error copy, README secure-context note.
