import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { friendlyMessage } from '../api/errors'
import { TokensWeb } from '../api/schemas'
import { config } from '../config'
import { Banner } from '../ui/Banner'
import { deviceInfo } from './device'
import { useCompleteLogin } from './session'

interface GoogleIdApi {
  initialize(options: { client_id: string; callback: (r: { credential: string }) => void }): void
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } }
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client'
let gisPromise: Promise<GoogleIdApi> | undefined

/** Loads the Google Identity Services script once per page. */
function loadGis(): Promise<GoogleIdApi> {
  const ready = window.google?.accounts.id
  if (ready) return Promise.resolve(ready)
  gisPromise ??= new Promise<GoogleIdApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () => {
      const id = window.google?.accounts.id
      if (id) resolve(id)
      else reject(new Error('Google sign-in did not load'))
    }
    script.onerror = () => reject(new Error('Google sign-in could not be loaded'))
    document.head.appendChild(script)
  }).catch((e: unknown) => {
    gisPromise = undefined // allow a retry on the next mount
    throw e
  })
  return gisPromise
}

/** "Continue with Google"; renders nothing unless VITE_GOOGLE_CLIENT_ID is set. */
export function GoogleButton({ next }: { next: string | null }) {
  const clientId = config.googleClientId
  const slot = useRef<HTMLDivElement>(null)
  const complete = useCompleteLogin()
  const [error, setError] = useState<string | null>(null)
  const nextRef = useRef(next)
  useEffect(() => {
    nextRef.current = next
  }, [next])
  const completeRef = useRef(complete)
  useEffect(() => {
    completeRef.current = complete
  }, [complete])

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    loadGis()
      .then((gis) => {
        if (cancelled || !slot.current) return
        gis.initialize({
          client_id: clientId,
          callback: ({ credential }) => {
            setError(null)
            api
              .post('/v1/auth/google', {
                schema: TokensWeb,
                body: { id_token: credential, client: 'web', device: deviceInfo() },
              })
              .then((tokens) => completeRef.current(tokens, nextRef.current))
              .catch((e: unknown) => setError(friendlyMessage(e)))
          },
        })
        gis.renderButton(slot.current, { theme: 'outline', size: 'large', text: 'continue_with' })
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(friendlyMessage(e))
      })
    return () => {
      cancelled = true
    }
  }, [clientId])

  if (!clientId) return null
  return (
    <div className="space-y-2">
      <div ref={slot} className="flex justify-center" />
      {error && <Banner tone="error">{error}</Banner>}
    </div>
  )
}
