import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, CircleHelp, Copy, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from './AuthContext'
import { getUserMessage, logSafeFailure } from '../../lib/errors'
import { emailSchema, passwordSchema } from '../../lib/validation'
import { supabase } from '../../lib/supabase'

function AuthBrandPanel() {
  return (
    <section className="auth-brand-panel" aria-label="CheckTrack information">
      <div className="auth-brand-top">
        <img src="/favicon.svg" alt="" />
        <strong>CheckTrack</strong>
      </div>
      <div className="auth-brand-copy">
        <p className="eyebrow">Controlled record management</p>
        <h1>Every record, clearly accounted for.</h1>
        <p>A secure workspace for authorized teams to track administrative records, status changes, and the history behind each update.</p>
        <div className="auth-trust-row">
          <span><ShieldCheck aria-hidden="true" /> Permission-aware access</span>
          <span><Check aria-hidden="true" /> Traceable status history</span>
        </div>
      </div>
      <div className="auth-brand-foot">Access is invitation-only. Your organization administrator manages accounts.</div>
    </section>
  )
}

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-layout">
      <AuthBrandPanel />
      <section className="auth-main">
        <div className="auth-panel">{children}</div>
      </section>
    </main>
  )
}

export function SignInPage() {
  const { signIn, configured, loading, session, authNotice } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && session) navigate('/app', { replace: true })
  }, [loading, session, navigate])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const parsedEmail = emailSchema.safeParse(email)
    if (!parsedEmail.success) {
      setError(parsedEmail.error.issues[0]?.message ?? 'Enter a valid email address.')
      return
    }
    if (!password) {
      setError('Enter your password.')
      return
    }
    setSubmitting(true)
    try {
      await signIn(parsedEmail.data, password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from?.startsWith('/app') ? from : '/app', { replace: true })
    } catch (caught) {
      setError(getUserMessage(caught))
      logSafeFailure('sign in', caught)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <p className="eyebrow">Secure workspace</p>
      <h2>Sign in to CheckTrack</h2>
      <p>Use the verified email address associated with your invitation.</p>
      {!configured && (
        <div className="alert alert-neutral" role="status">
          <CircleHelp aria-hidden="true" />
          <span>Supabase is not connected yet. Add the project URL and publishable key to <code>.env</code>, then restart the application.</span>
        </div>
      )}
      {authNotice && <div className="alert alert-error" role="alert">{authNotice}</div>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="field-label">Email address</span>
          <input className="field-input" type="email" autoComplete="username" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={!configured || submitting} />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input className="field-input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={!configured || submitting} />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Link className="auth-subtle-link" to="/password-reset">Forgot your password?</Link>
        </div>
        <button className="button button-primary" type="submit" disabled={!configured || submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="auth-footnote">Accounts are provisioned by an administrator. Public self-registration is disabled.</p>
    </AuthLayout>
  )
}

export function PasswordResetPage() {
  const { requestPasswordReset, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const parsed = emailSchema.safeParse(email)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email address.')
      return
    }
    setSubmitting(true)
    try {
      await requestPasswordReset(parsed.data)
      // Supabase intentionally does not reveal whether an email belongs to an account.
      setSent(true)
    } catch (caught) {
      setError(getUserMessage(caught))
      logSafeFailure('password reset request', caught)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <Link className="auth-subtle-link" to="/sign-in" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 24, textDecoration: 'none' }}><ArrowLeft size={14} aria-hidden="true" /> Back to sign in</Link>
      <p className="eyebrow">Account recovery</p>
      <h2>Reset your password</h2>
      <p>Enter your work email. If it is associated with an active account, Supabase will send a secure reset link.</p>
      {sent ? (
        <div className="alert" role="status"><Check aria-hidden="true" /><span>If an account matches that address, a password-reset email is on its way. Follow the link in the email to choose a new password.</span></div>
      ) : (
        <>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {!configured && <div className="alert alert-neutral" role="status">Connect Supabase before using password recovery.</div>}
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <label className="field">
              <span className="field-label">Email address</span>
              <input className="field-input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={!configured || submitting} />
            </label>
            <button className="button button-primary" type="submit" disabled={!configured || submitting}>{submitting ? 'Sending…' : 'Send reset link'}</button>
          </form>
        </>
      )}
      <p className="auth-footnote">For security, CheckTrack does not confirm whether a particular email is registered.</p>
    </AuthLayout>
  )
}

export function SetPasswordPage() {
  const { session, updatePassword, configured, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const parsed = passwordSchema.safeParse(password)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Choose a stronger password.')
      return
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await updatePassword(parsed.data)
      await refreshProfile()
      toast.success('Password updated.')
      navigate('/app', { replace: true })
    } catch (caught) {
      setError(getUserMessage(caught))
      logSafeFailure('password update', caught)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <p className="eyebrow">Account recovery</p>
      <h2>Choose a new password</h2>
      <p>Your reset link must open this page in the same browser session.</p>
      {!session && <div className="alert alert-error" role="alert">No recovery session was found. Open the latest password-reset link from your email, or request another link.</div>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="field-label">New password</span>
          <input className="field-input" type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required disabled={!configured || !session || submitting} />
          <span className="field-hint">Use at least 12 characters.</span>
        </label>
        <label className="field">
          <span className="field-label">Confirm new password</span>
          <input className="field-input" type="password" autoComplete="new-password" minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required disabled={!configured || !session || submitting} />
        </label>
        <button className="button button-primary" type="submit" disabled={!configured || !session || submitting}>{submitting ? 'Updating…' : 'Update password'}</button>
      </form>
    </AuthLayout>
  )
}

export function MfaPage() {
  const { profile, assuranceLevel, refreshAssurance } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [factorId, setFactorId] = useState<string | null>(null)
  const [factorName, setFactorName] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile && profile.role !== 'administrator') {
      navigate('/app', { replace: true })
      return
    }
    if (assuranceLevel === 'aal2') {
      const from = (location.state as { from?: string } | null)?.from
      navigate(from?.startsWith('/app') ? from : '/app', { replace: true })
      return
    }
    const client = supabase
    if (!client) {
      setLoading(false)
      return
    }
    let alive = true
    void client.auth.mfa.listFactors()
      .then(({ data, error: factorError }) => {
        if (!alive) return
        if (factorError) {
          setError(getUserMessage(factorError))
          return
        }
        const verified = data?.totp.find((factor) => factor.status === 'verified')
        if (verified) {
          setFactorId(verified.id)
          setFactorName(verified.friendly_name || 'Authenticator')
        }
      })
      .catch((caught) => {
        if (alive) {
          setError(getUserMessage(caught))
          logSafeFailure('administrator MFA factor lookup', caught)
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [profile, assuranceLevel, navigate, location.state])

  async function beginEnrollment() {
    if (!supabase) return
    setError('')
    setWorking(true)
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'CheckTrack administrator',
        issuer: 'CheckTrack',
      })
      if (enrollError) throw enrollError
      setFactorId(data.id)
      setFactorName('CheckTrack administrator')
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
    } catch (caught) {
      setError(getUserMessage(caught))
      logSafeFailure('administrator MFA enrollment', caught)
    } finally {
      setWorking(false)
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !factorId) return
    const normalizedCode = code.replace(/\s/g, '')
    if (!/^\d{6,8}$/.test(normalizedCode)) {
      setError('Enter the current 6–8 digit code from your authenticator app.')
      return
    }
    setError('')
    setWorking(true)
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
      if (challengeError) throw challengeError
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: normalizedCode,
      })
      if (verifyError) throw verifyError
      const level = await refreshAssurance()
      if (level !== 'aal2') throw new Error('The second verification step did not complete. Try the current code again.')
      toast.success('Administrator verification complete.')
      const from = (location.state as { from?: string } | null)?.from
      navigate(from?.startsWith('/app') ? from : '/app', { replace: true })
    } catch (caught) {
      setError(getUserMessage(caught))
      logSafeFailure('administrator MFA verification', caught)
    } finally {
      setWorking(false)
    }
  }

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret)
      toast.success('Authenticator key copied.')
    } catch {
      toast.error('Copy was unavailable. Select and copy the key manually.')
    }
  }

  if (loading) return <main className="loading-state"><span className="loading-mark"><span className="spinner" /> Checking administrator verification…</span></main>

  return (
    <AuthLayout>
      <p className="eyebrow">Administrator security</p>
      <h2>Verify your identity</h2>
      <p>Administrator actions require a second authentication factor. Set up or use a time-based authenticator.</p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {qrCode ? (
        <div className="surface-card" style={{ padding: 18, marginBottom: 16 }}>
          <p className="field-label">1. Scan this QR code with your authenticator app</p>
          <img src={qrCode} alt="Authenticator setup QR code" style={{ display: 'block', width: 176, height: 176, margin: '14px auto', border: '1px solid #e8e3d8', borderRadius: 8, background: '#fff', padding: 8 }} />
          <p className="field-hint">Or enter this key manually:</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
            <code style={{ flex: 1, overflowWrap: 'anywhere', borderRadius: 7, background: '#f2efe8', padding: 9, color: '#263647', fontSize: 11 }}>{secret}</code>
            <button className="icon-button" type="button" aria-label="Copy authenticator key" onClick={() => void copySecret()}><Copy aria-hidden="true" /></button>
          </div>
          <p className="field-hint" style={{ marginTop: 10 }}>Keep this key private. It will not be shown again after setup.</p>
        </div>
      ) : factorId ? (
        <div className="alert alert-neutral" role="status"><LockKeyhole aria-hidden="true" /><span>Enter the current code from your {factorName} authenticator.</span></div>
      ) : (
        <div className="alert alert-neutral" role="status"><KeyRound aria-hidden="true" /><span>Set up an authenticator app before continuing with administrator access.</span></div>
      )}
      {!factorId ? (
        <button className="button button-primary" type="button" onClick={() => void beginEnrollment()} disabled={working || !supabase}>{working ? 'Preparing…' : 'Set up authenticator'}</button>
      ) : (
        <form className="auth-form" onSubmit={verifyCode} noValidate>
          <label className="field">
            <span className="field-label">Authenticator code</span>
            <input className="field-input" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(event) => setCode(event.target.value)} required disabled={working} />
          </label>
          <button className="button button-primary" type="submit" disabled={working}>{working ? 'Verifying…' : 'Verify and continue'}</button>
        </form>
      )}
      <p className="auth-footnote">For account recovery, contact another administrator. Do not share one-time codes or authenticator keys.</p>
    </AuthLayout>
  )
}
