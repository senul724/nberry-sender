import { useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { api } from '../../api/client'
import { ApiError, friendlyMessage } from '../../api/errors'
import { LoginResponse, TokensWeb } from '../../api/schemas'
import { deviceInfo } from '../../auth/device'
import { GoogleButton } from '../../auth/GoogleButton'
import { safeNext, useCompleteLogin, useSignedIn } from '../../auth/session'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { linkClass } from '../../ui/focus'
import { AuthLayout } from './AuthLayout'

export function LoginPage() {
  const [params] = useSearchParams()
  const next = params.get('next')
  const complete = useCompleteLogin()
  const signedIn = useSignedIn()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaToken, setMfaToken] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | Error | null>(null)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Something went wrong'))
    } finally {
      setBusy(false)
    }
  }

  function onLogin(e: FormEvent) {
    e.preventDefault()
    void run(async () => {
      const res = await api.post('/v1/auth/login', {
        schema: LoginResponse,
        body: { email: email.trim(), password, client: 'web', device: deviceInfo() },
      })
      if ('mfa_required' in res) {
        setMfaToken(res.mfa_token)
        setPassword('')
        return
      }
      await complete(res, next)
    })
  }

  function onMfa(e: FormEvent) {
    e.preventDefault()
    void run(async () => {
      const tokens = await api.post('/v1/auth/mfa/verify', {
        schema: TokensWeb,
        body: { mfa_token: mfaToken, code: code.trim(), client: 'web', device: deviceInfo() },
      })
      await complete(tokens, next)
    })
  }

  const notVerified = error instanceof ApiError && error.code === 'email_not_verified'
  const errorBanner = error && (
    <Banner tone="error">
      {friendlyMessage(error)}
      {notVerified && (
        <>
          {' '}
          <Link
            to={`/verify-email?email=${encodeURIComponent(email.trim())}`}
            className={linkClass}
          >
            Verify your email
          </Link>
        </>
      )}
    </Banner>
  )

  if (signedIn) return <Navigate to={safeNext(next)} replace />

  if (mfaToken) {
    return (
      <AuthLayout
        title="Enter your code"
        subtitle="We emailed a 6-digit code to confirm it's you."
        footer={
          <button
            type="button"
            className={linkClass}
            onClick={() => {
              setMfaToken(null)
              setError(null)
              setCode('')
            }}
          >
            Back to sign in
          </button>
        }
      >
        <form onSubmit={onMfa} className="space-y-4">
          {errorBanner}
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
            Verify
          </Button>
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Sign in"
      footer={
        <>
          New here?{' '}
          <Link
            to={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`}
            className={linkClass}
          >
            Create an account
          </Link>
        </>
      }
    >
      {params.get('reset') && (
        <Banner tone="success">
          Your password was changed and you were signed out everywhere. Sign in with the new one.
        </Banner>
      )}
      {params.get('verified') && (
        <Banner tone="success">Email verified. You can sign in now.</Banner>
      )}
      <form onSubmit={onLogin} className="space-y-4">
        {errorBanner}
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" loading={busy} className="w-full">
          Sign in
        </Button>
      </form>
      <GoogleButton next={next} />
      <p className="text-center text-sm">
        <Link to="/forgot" className={linkClass}>
          Forgot your password?
        </Link>
      </p>
    </AuthLayout>
  )
}
