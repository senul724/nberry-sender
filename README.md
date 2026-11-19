# nBerry Sender dashboard

Web dashboard for businesses that send notifications through the nBerry backend. Vite + React 19 + TypeScript (strict), Tailwind v4, React Router, TanStack Query; tests with Vitest, Testing Library and MSW.

## Features

- Sign up, log in (email, 2FA code, Google), password reset
- Sender (org) switcher and creation, role-based navigation (owner, admin, developer)
- Overview stats and setup checklist
- Compose a broadcast from the dashboard (idempotent) and a Messages table
- Broadcast QR code (PNG, SVG, printable poster) and code regeneration
- Settings: details, logo, callback URL and signing secret; API keys (shown once)
- Team (add, change role, remove, leave), danger zone (delete sender), linked customers
- Developers: copy-paste `curl` and Node examples for `/v1/send/*` and callback signature verification
- Account: name, 2FA, email change, sessions, delete account
- Admin (platform admins only): sender status and send rate

## Development

1. Run the nBerry backend with cookies that work over plain HTTP and CORS for the dev origin:

   ```sh
   ENV=dev COOKIE_SECURE=false WEB_ORIGINS=http://localhost:5173 <start the Go backend on :8080>
   ```

2. Install and start the dashboard:

   ```sh
   pnpm install
   pnpm dev      # http://localhost:5173
   ```

   Vite proxies `/v1` to `http://localhost:8080` (`changeOrigin: false`), so the browser sees one origin and the auth cookies stay same-origin.

## Scripts

| Command          | What it does                   |
| ---------------- | ------------------------------ |
| `pnpm dev`       | Dev server with `/v1` proxy    |
| `pnpm typecheck` | `tsc -b`                       |
| `pnpm lint`      | ESLint, zero warnings allowed  |
| `pnpm test`      | Vitest (jsdom, MSW)            |
| `pnpm build`     | Typecheck and production build |

## Production

The dashboard and the API must share an origin: route `/v1/*` on the dashboard host to the API (reverse proxy / CDN rule). The `nb_refresh` cookie is scoped to `Path=/v1/auth` and the JS reads `nb_csrf`, so a separate API origin will not work with cookies. Serve the built `dist/` as a SPA (fallback to `index.html`).

## Environment variables

Read only in `src/config.ts`. See `.env.example`.

| Variable                | Default              | Meaning                                                         |
| ----------------------- | -------------------- | --------------------------------------------------------------- |
| `VITE_API_BASE_URL`     | `""` (same origin)   | Base URL of the API                                             |
| `VITE_LINK_BASE_URL`    | `https://nberry.app` | Base of links/QR codes shown to users (trailing slash stripped) |
| `VITE_GOOGLE_CLIENT_ID` | unset                | Google OAuth client id; when unset the Google button is hidden  |
