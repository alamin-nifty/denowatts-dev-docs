import { useState } from 'react'
import { signIn, PORTAL_URL } from './auth.js'

// Sign-in only. There is deliberately no signup here: accounts are created in
// the Denowatts portal, and only staff accounts can read these docs.
export default function SignIn({ onSignedIn, notice }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(notice || '')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const session = await signIn(email, password)
      onSignedIn(session)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="logo auth-logo">
          <span className="logo-mark"><span className="logo-dot" /></span>
          <span className="logo-text">DenoWatts<span className="logo-sub">docs</span></span>
        </div>
        <h1 className="auth-title">Sign in</h1>
        <p className="auth-hint">Use your Denowatts portal account. These docs are for Denowatts staff.</p>

        <label className="auth-field">
          <span>Email</span>
          <input type="email" autoComplete="username" value={email} autoFocus
            onChange={(e) => setEmail(e.target.value)} disabled={busy} />
        </label>
        <label className="auth-field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} disabled={busy} />
        </label>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="auth-foot">
          Forgot your password? Reset it from the{' '}
          <a href={`${PORTAL_URL}/signin`} target="_blank" rel="noreferrer">Denowatts portal</a>.
        </p>
      </form>
    </div>
  )
}
