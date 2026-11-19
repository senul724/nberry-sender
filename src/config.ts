// The only place environment variables are read.
const env = import.meta.env

export const config = {
  /** Base URL of the nBerry API; empty string means same origin. */
  apiBaseUrl: (env.VITE_API_BASE_URL ?? '').replace(/\/+$/, ''),
  /** Base of the public links / QR codes; no trailing slash. */
  linkBaseUrl: (env.VITE_LINK_BASE_URL || 'https://nberry.app').replace(/\/+$/, ''),
  /** Google OAuth client id; when undefined the Google button is hidden. */
  googleClientId: env.VITE_GOOGLE_CLIENT_ID || undefined,
} as const
