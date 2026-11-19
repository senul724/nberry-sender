import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { friendlyMessage } from '../../api/errors'
import { CallbackSecret as CallbackSecretSchema } from '../../api/schemas'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { CopyField } from '../../ui/CopyField'
import { Dialog } from '../../ui/Dialog'

/**
 * The callback signing secret. It lives only in this component's state: fetched with `api.*`
 * directly (no TanStack Query cache, no mutation cache), cleared on hide, and gone on unmount.
 */
export function CallbackSecretSection({ orgId }: { orgId: string }) {
  const path = `/v1/orgs/${encodeURIComponent(orgId)}/callback-secret`
  const [secret, setSecret] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  async function run(method: 'get' | 'post') {
    setBusy(true)
    setError(null)
    try {
      const res = await api[method](path, { schema: CallbackSecretSchema })
      if (mounted.current) {
        setSecret(res.callback_secret)
        setConfirming(false)
      }
    } catch (e) {
      if (mounted.current) setError(friendlyMessage(e))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Callback secret</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        nBerry signs every callback to your server with this secret. Keep it private.
      </p>
      {error && !confirming && <Banner tone="error">{error}</Banner>}
      {secret !== null && <CopyField label="Callback secret" value={secret} />}
      <div className="flex flex-wrap gap-2">
        {secret === null ? (
          <Button variant="secondary" loading={busy} onClick={() => void run('get')}>
            Reveal secret
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => setSecret(null)}>
            Hide secret
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            setError(null)
            setConfirming(true)
          }}
        >
          Rotate secret
        </Button>
      </div>

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Rotate secret?">
        <p className="text-sm">
          The old secret stops working immediately. Your server must be updated with the new secret
          or it will reject nBerry callbacks.
        </p>
        {error && (
          <Banner tone="error" className="mt-3">
            {error}
          </Banner>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={() => void run('post')}>
            Rotate secret
          </Button>
        </div>
      </Dialog>
    </section>
  )
}
