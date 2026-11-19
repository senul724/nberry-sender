import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { api } from '../../api/client'
import { friendlyMessage } from '../../api/errors'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { linkClass } from '../../ui/focus'
import { AuthLayout } from './AuthLayout'

export function ResetPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/v1/auth/password/reset', {
        schema: z.undefined(),
        body: { email: email.trim(), code: code.trim(), new_password: password },
      })
      navigate('/login?reset=1', { replace: true })
    } catch (err) {
      setError(friendlyMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Choose a new password"
      footer={
        <Link to="/login" className={linkClass}>
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        {error && <Banner tone="error">{error}</Banner>}
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" loading={busy} className="w-full">
          Reset password
        </Button>
      </form>
    </AuthLayout>
  )
}
