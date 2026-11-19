import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { friendlyMessage } from '../../api/errors'
import { Org } from '../../api/schemas'
import { orgKey, orgsKey } from '../../orgs/queries'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { controlClass } from '../../ui/fieldStyles'
import { validateLogo } from './logoFile'

interface Picked {
  file: File
  url: string
}

export function LogoSection({ org }: { org: Org }) {
  const queryClient = useQueryClient()
  const base = `/v1/orgs/${encodeURIComponent(org.id)}/logo`
  const [picked, setPicked] = useState<Picked | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const pickSeq = useRef(0)

  useEffect(() => {
    const url = picked?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [picked])

  const done = (updated: Org) => {
    queryClient.setQueryData(orgKey(org.id), updated)
    void queryClient.invalidateQueries({ queryKey: orgsKey, exact: true })
    setPicked(null)
  }
  const upload = useMutation({
    mutationFn: (file: File) =>
      api.put(base, { schema: Org, rawBody: file, contentType: file.type }),
    onSuccess: done,
  })
  const remove = useMutation({
    mutationFn: () => api.delete(base, { schema: Org }),
    onSuccess: done,
  })

  async function choose(file: File | undefined) {
    const seq = ++pickSeq.current
    upload.reset()
    remove.reset()
    setPicked(null)
    setFileError(null)
    if (!file) return
    const problem = await validateLogo(file)
    if (seq !== pickSeq.current) return
    if (problem) setFileError(problem)
    else setPicked({ file, url: URL.createObjectURL(file) })
  }

  const error = upload.error ?? remove.error
  return (
    <section aria-labelledby="logo-heading" className="space-y-3">
      <h2 id="logo-heading" className="text-lg font-semibold">
        Logo
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        PNG, JPEG or WebP, up to 1 MiB, between 64 and 2048 px on each side. It is shown as a
        square, so a square image works best.
      </p>
      <div className="flex items-start gap-4">
        {org.logo_url && (
          <img
            src={org.logo_url}
            alt="Current logo"
            className="size-24 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
          />
        )}
        {picked && (
          <img
            src={picked.url}
            alt="Logo preview"
            className="size-24 rounded-lg border border-berry-300 object-cover"
          />
        )}
      </div>
      {fileError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {fileError}
        </p>
      )}
      {error && <Banner tone="error">{friendlyMessage(error)}</Banner>}
      <div className="space-y-1">
        <label htmlFor="logo-file" className="block text-sm font-medium">
          Logo file
        </label>
        <input
          id="logo-file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className={controlClass}
          onChange={(e) => void choose(e.target.files?.[0])}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {picked && (
          <Button loading={upload.isPending} onClick={() => upload.mutate(picked.file)}>
            Upload logo
          </Button>
        )}
        {org.logo_url && (
          <Button variant="secondary" loading={remove.isPending} onClick={() => remove.mutate()}>
            Remove logo
          </Button>
        )}
      </div>
    </section>
  )
}
