import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { api } from '../../api/client'
import { ApiError, friendlyMessage } from '../../api/errors'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { linkClass } from '../../ui/focus'
import { AuthLayout } from './AuthLayout'

const CheckEmail = z.object({ status: z.string() })

export function ForgotPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/v1/auth/password/forgot', {
        schema: CheckEmail,
        body: { email: email.trim() },
      })
      setDone(true)
    } catch (err) {
      // Never reveal whether the account exists. Only failures that say nothing about the
      // account (rate limit, network, server error) are surfaced; the rest keep the neutral copy.
      if (err instanceof ApiError && (err.status === 0 || err.status === 429 || err.status >= 500))
        setError(friendlyMessage(err))
      else setDone(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      footer={
        <Link to="/login" className={linkClass}>
          Back to sign in
        </Link>
      }
    >
      {done ? (
        <div className="space-y-4">
          <Banner tone="success">If that account exists, we've sent a code.</Banner>
          <Link
            to={`/reset?email=${encodeURIComponent(email.trim())}`}
            className={`${linkClass} block text-center text-sm`}
          >
            I have a code
          </Link>
        </div>
      ) : (
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
          <Button type="submit" loading={busy} className="w-full">
            Send code
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
