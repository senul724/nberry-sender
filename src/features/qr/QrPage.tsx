import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { api } from '../../api/client'
import { friendlyMessage } from '../../api/errors'
import { Org } from '../../api/schemas'
import { config } from '../../config'
import { useCurrentOrg } from '../../orgs/context'
import { useRole } from '../../orgs/roles'
import { orgKey, orgsKey } from '../../orgs/queries'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { CopyField } from '../../ui/CopyField'
import { Dialog } from '../../ui/Dialog'
import { composeQrPng, qrSvgString, type QrMatrix } from './exportQr'
import { QrSvg } from './QrSvg'

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

const PRINT_CSS = `
@page { size: A5; margin: 10mm; }
@media print {
  body * { visibility: hidden; }
  .print-poster, .print-poster * { visibility: visible; }
  .print-poster { position: absolute; inset: 0; padding-top: 10mm; }
}`

export function QrPage() {
  const org = useCurrentOrg()
  const { can } = useRole()
  const queryClient = useQueryClient()
  const link = `${config.linkBaseUrl}/s/${org.broadcast_code}`
  const matrix = useMemo<QrMatrix>(() => {
    const qr = QRCode.create(link, { errorCorrectionLevel: 'H' })
    return { size: qr.modules.size, isDark: (r, c) => qr.modules.get(r, c) === 1 }
  }, [link])
  const label = `QR code for ${org.name}`
  const slug =
    org.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'nberry'

  const [confirming, setConfirming] = useState(false)
  // The note belongs to one org + logo; it disappears when either changes.
  const exportKey = `${org.id}|${org.logo_url ?? ''}`
  const [pngNoteKey, setPngNoteKey] = useState<string | null>(null)
  const pngNote = pngNoteKey === exportKey
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const regenerate = useMutation({
    mutationFn: () =>
      api.post(`/v1/orgs/${encodeURIComponent(org.id)}/broadcast-code`, { schema: Org }),
    onSuccess: (updated) => {
      queryClient.setQueryData(orgKey(org.id), updated)
      void queryClient.invalidateQueries({ queryKey: orgsKey, exact: true })
      setConfirming(false)
    },
  })

  async function downloadPng() {
    setDownloadError(null)
    try {
      const { blob, withLogo } = await composeQrPng(matrix, org.logo_url)
      setPngNoteKey(org.logo_url && !withLogo ? exportKey : null)
      download(blob, `${slug}-qr.png`)
    } catch (e) {
      setDownloadError(friendlyMessage(e))
    }
  }

  function downloadSvg() {
    const svg = qrSvgString(matrix, org.logo_url, label)
    download(new Blob([svg], { type: 'image/svg+xml' }), `${slug}-qr.svg`)
  }

  return (
    <div className="max-w-xl space-y-6">
      {/* Mounted only on this page, so Ctrl+P elsewhere prints normally. */}
      <style>{PRINT_CSS}</style>
      <h1 className="text-2xl font-semibold">QR code</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Customers scan this code in the nBerry app to follow {org.name}.
      </p>

      <QrSvg
        matrix={matrix}
        logoUrl={org.logo_url}
        label={label}
        className="w-full max-w-sm rounded-lg border border-zinc-200 dark:border-zinc-700"
      />
      <CopyField label="Follow link" value={link} />

      {downloadError && <Banner tone="error">{downloadError}</Banner>}
      {pngNote && (
        <Banner tone="info">
          The PNG was saved without the logo because the logo could not be loaded for export. The
          SVG and the on-screen code still include it.
        </Banner>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void downloadPng()}>Download PNG</Button>
        <Button variant="secondary" onClick={downloadSvg}>
          Download SVG
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>
          Print poster
        </Button>
      </div>

      {can.editSettings && (
        <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <h2 className="text-base font-semibold">Regenerate code</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Use this if the code leaked or you want to retire old printouts.
          </p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => {
              regenerate.reset()
              setConfirming(true)
            }}
          >
            Regenerate code
          </Button>
        </div>
      )}

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Regenerate code?">
        <p className="text-sm">Old printed codes stop working. Your subscribers stay subscribed.</p>
        {regenerate.isError && (
          <Banner tone="error" className="mt-3">
            {friendlyMessage(regenerate.error)}
          </Banner>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={regenerate.isPending}
            onClick={() => regenerate.mutate()}
          >
            Regenerate code
          </Button>
        </div>
      </Dialog>

      <section
        aria-label="Poster for printing"
        className="print-poster hidden flex-col items-center gap-6 text-center print:flex"
      >
        {org.logo_url && <img src={org.logo_url} alt="" className="h-24 w-24 object-contain" />}
        <p className="text-3xl font-bold">{org.name}</p>
        <QrSvg
          matrix={matrix}
          logoUrl={org.logo_url}
          label={`Scan code on the poster for ${org.name}`}
          className="w-72"
        />
        <p className="text-xl">Scan with nBerry to follow</p>
      </section>
    </div>
  )
}
