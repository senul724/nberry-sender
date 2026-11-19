import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { api } from '../../api/client'
import { friendlyMessage } from '../../api/errors'
import { GoogleButton } from '../../auth/GoogleButton'
import { safeNext, useSignedIn } from '../../auth/session'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { linkClass } from '../../ui/focus'
import { AuthLayout } from './AuthLayout'

const CheckEmail = z.object({ status: z.string() })

export function SignupPage() {
  const navigate = useNavigate()
  const signedIn = useSignedIn()
  const [params] = useSearchParams()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/v1/auth/signup', {
        schema: CheckEmail,
        body: { name: name.trim(), email: email.trim(), password },
      })
      navigate(`/verify-email?email=${encodeURIComponent(email.trim())}&sent=1`)
    } catch (err) {
      setError(friendlyMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (signedIn) return <Navigate to={safeNext(params.get('next'))} replace />

  return (
    <AuthLayout
      title="Create your account"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className={linkClass}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        {error && <Banner tone="error">{error}</Banner>}
        <Field
          label="Name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" loading={busy} className="w-full">
          Create account
        </Button>
      </form>
      <GoogleButton next={params.get('next')} />
    </AuthLayout>
  )
}
