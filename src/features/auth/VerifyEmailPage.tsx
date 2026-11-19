import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { api } from '../../api/client'
import { friendlyMessage } from '../../api/errors'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { AuthLayout, linkClass } from './AuthLayout'

const CheckEmail = z.object({ status: z.string() })

export function VerifyEmailPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const sent = params.get('sent') === '1'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await api.post('/v1/auth/verify-email', {
        schema: z.undefined(),
        body: { email: email.trim(), code: code.trim() },
      })
      navigate('/login?verified=1', { replace: true })
    } catch (err) {
      setError(friendlyMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function onResend() {
    setResending(true)
    setError(null)
    setNotice(null)
    try {
      await api.post('/v1/auth/resend-verification', {
        schema: CheckEmail,
        body: { email: email.trim() },
      })
      setNotice("If that account exists, we've sent a code.")
    } catch (err) {
      setError(friendlyMessage(err))
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthLayout
      title={sent ? 'Check your email' : 'Verify your email'}
      subtitle="Enter the 6-digit code we sent you."
      footer={
        <Link to="/login" className={linkClass}>
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        {error && <Banner tone="error">{error}</Banner>}
        {notice && <Banner tone="success">{notice}</Banner>}
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
        <Button type="submit" loading={busy} className="w-full">
          Verify email
        </Button>
      </form>
      <div className="text-center">
        <Button
          variant="ghost"
          loading={resending}
          disabled={!email.trim()}
          onClick={() => void onResend()}
        >
          Resend code
        </Button>
      </div>
    </AuthLayout>
  )
}
