import { useEffect, useState } from 'react'
import DocsPortal from './DocsPortal.jsx'
import SignIn from './SignIn.jsx'
import { restoreSession, signOut } from './auth.js'

// Nothing from the docs renders until the backend has confirmed a signed-in,
// allowed account. See auth.js for why this is a screen, not a hard lock.
export default function AuthGate() {
  const [state, setState] = useState({ status: 'checking' })

  const check = () =>
    restoreSession().then(
      (session) => setState(session ? { status: 'in', user: session.user } : { status: 'out' }),
      (e) => setState({ status: 'offline', message: e.message }),
    )

  useEffect(() => { check() }, [])

  if (state.status === 'checking') {
    return <div className="auth-page"><p className="auth-status">Checking your sign-in…</p></div>
  }

  if (state.status === 'offline') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-title">Can't check your sign-in</h1>
          <p className="auth-error" role="alert">{state.message}</p>
          <button className="auth-submit" onClick={() => { setState({ status: 'checking' }); check() }}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (state.status === 'out') {
    return <SignIn notice={state.notice} onSignedIn={(s) => setState({ status: 'in', user: s.user })} />
  }

  return (
    <DocsPortal
      user={state.user}
      onSignOut={async () => {
        await signOut()
        setState({ status: 'out' })
      }}
    />
  )
}
