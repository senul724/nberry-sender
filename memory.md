# nBerry sender dashboard: project memory

## Overview
Web dashboard for nBerry senders (orgs): setup, compose broadcasts, messages, QR, API keys, team, account, admin.
- **Status:** design approved 2026-11-19; Plan 1 (whole dashboard) being built subagent-driven.
- Design: `docs/superpowers/specs/2026-11-19-sender-dashboard-design.md`. Plan: `docs/superpowers/plans/2026-11-19-plan-1-dashboard.md`.

## Tech Stack
Vite + React 19 + TypeScript strict, Tailwind v4 (`@tailwindcss/vite`), React Router, TanStack Query, zod, `qrcode`; Vitest + Testing Library + MSW; pnpm, ESLint, Prettier.

## Key Decisions
<!-- Format: - YYYY-MM-DD — decision — why -->
- 2026-11-19 — Separate repo `nberry-sender` next to the backend (user choice).
- 2026-11-19 — Same-origin deploy: Vite proxies `/v1` → `http://localhost:8080` in dev; prod host routes `/v1/*` to the API — JS must read `nb_csrf` after reload and `nb_refresh` has Path=/v1/auth.
- 2026-11-19 — Look: neutral white/zinc + one berry-purple accent, sidebar on desktop, menu on phones, dark mode (Claude's call, accepted).

## Backend facts that shape the client
- Cookies: `nb_access` (HttpOnly, 15 min), `nb_refresh` (HttpOnly, Path=/v1/auth, 30 d), `nb_csrf` (readable, 30 d). Double-submit: `X-CSRF-Token` must equal the `nb_csrf` cookie on every non-GET, **including `POST /v1/auth/refresh`**.
- Refresh rotates every time; reuse of an old refresh token revokes the session → refresh must be single-flight.

## How to Run
(filled in by Task 1)

## Current Focus / Next Steps
- [ ] Plan 1 tasks 1–8.

## Session Log
- 2026-11-19 — Created repo, design doc and plan; started subagent-driven build.
