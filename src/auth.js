// Sign-in against the real Denowatts backend — login only, no signup.
//
// This is a login screen, not a hard lock: the flow docs are compiled into the
// app bundle at build time (see `import.meta.glob` in DocsPortal.jsx), so it
// keeps out anyone without an allowed account but a determined person could
// still read the docs out of the built JS. Real protection needs a server that
// checks the token before sending any doc.
//
// Backend contract (denowatts-backend/src/auth/auth.resolver.ts):
//   login(loginInput: { email, password }) -> { accessToken, refreshToken, user }
//   refreshToken(refreshTokenInput: { token }) -> rotated { accessToken, refreshToken }
//   logout(refreshTokenInput: { token })       -> revokes that session
//   profile                                    -> the user the access token belongs to
// Access tokens last minutes (5m dev / 15m prod), refresh tokens 30 days, and a
// refresh token is single-use (rotated on every refresh).

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'https://dev.portal.denowatts.com/backend').replace(/\/+$/, '')
const GRAPHQL_URL = `${BACKEND_URL}/graphql`

export const PORTAL_URL = (import.meta.env.VITE_PORTAL_URL || 'https://dev.portal.denowatts.com').replace(/\/+$/, '')

// Who may read the docs. SUPER_ADMIN = Denowatts staff; ADMIN and USER are
// customer-company accounts, turned away even with a correct password.
const ALLOWED_TYPES = ['SUPER_ADMIN']

const STORAGE_KEY = 'denowatts-docs-session'
const USER_FIELDS = '_id email firstName lastName type status'

const LOGIN = `mutation DocsLogin($loginInput: LoginInput!) {
  login(loginInput: $loginInput) { accessToken refreshToken user { ${USER_FIELDS} } }
}`
const REFRESH = `mutation DocsRefreshToken($refreshTokenInput: RefreshTokenInput!) {
  refreshToken(refreshTokenInput: $refreshTokenInput) { accessToken refreshToken }
}`
const LOGOUT = `mutation DocsLogout($refreshTokenInput: RefreshTokenInput!) {
  logout(refreshTokenInput: $refreshTokenInput)
}`
const PROFILE = `query DocsProfile { profile { ${USER_FIELDS} } }`

export class AuthError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

async function gql(query, variables, accessToken) {
  let res
  try {
    res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    })
  } catch {
    throw new AuthError("Can't reach the Denowatts server. Check your connection and try again.", 'NETWORK')
  }
  if (res.status === 429) {
    throw new AuthError('Too many sign-in attempts. Wait a minute, then try again.', 'TOO_MANY_REQUESTS')
  }
  let body
  try {
    body = await res.json()
  } catch {
    throw new AuthError(`The Denowatts server sent an unexpected response (HTTP ${res.status}).`, 'BAD_RESPONSE')
  }
  if (body.errors?.length) {
    // This API puts `code` at the top level of each error; `extensions.code` is
    // the GraphQL-spec location, read too in case that ever changes.
    const e = body.errors[0]
    throw new AuthError(e.message || 'Request failed', e.code ?? e.extensions?.code)
  }
  return body.data
}

// Turn the backend's messages into something a person can act on.
function friendly(error) {
  if (!(error instanceof AuthError)) return new AuthError('Something went wrong. Please try again.', 'UNKNOWN')
  const msg = error.message || ''
  if (/invalid credentials/i.test(msg)) {
    return new AuthError("That email and password don't match a Denowatts account.", error.code)
  }
  if (/verify your email/i.test(msg)) {
    return new AuthError("This account isn't verified yet. We've sent a new confirmation email — open it, then sign in.", error.code)
  }
  if (/too many requests|throttl/i.test(msg)) {
    return new AuthError('Too many sign-in attempts. Wait a minute, then try again.', 'TOO_MANY_REQUESTS')
  }
  return error
}

// ---- stored session (per browser; wrapped because storage can be blocked) ----
function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const s = raw ? JSON.parse(raw) : null
    return s?.accessToken && s?.refreshToken ? s : null
  } catch {
    return null
  }
}
function saveSession(session) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)) } catch { /* private mode: session lasts this page only */ }
}
function clearSession() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* nothing to clear */ }
}

// End a session on the backend. Best effort: the local copy is already gone.
async function revoke(refreshToken) {
  try { await gql(LOGOUT, { refreshTokenInput: { token: refreshToken } }) } catch { /* ignore */ }
}

async function accept(session, user) {
  if (!user || !ALLOWED_TYPES.includes(user.type)) {
    // Don't leave an unused session open for an account we're turning away.
    clearSession()
    await revoke(session.refreshToken)
    throw new AuthError(
      'These docs are for Denowatts staff only. Your account can still use the Denowatts portal.',
      'NOT_ALLOWED',
    )
  }
  const next = { ...session, user }
  saveSession(next)
  return next
}

export async function signIn(email, password) {
  let data
  try {
    data = await gql(LOGIN, { loginInput: { email: email.trim(), password } })
  } catch (e) {
    throw friendly(e)
  }
  const { accessToken, refreshToken, user } = data.login
  return accept({ accessToken, refreshToken }, user)
}

async function confirm(session) {
  try {
    const { profile } = await gql(PROFILE, {}, session.accessToken)
    return accept(session, profile)
  } catch (e) {
    if (e.code !== 'UNAUTHENTICATED') throw e
  }
  // The access token has expired (they only last minutes). Trade the refresh
  // token for a new pair, and save it straight away: the old one is now used up.
  const { refreshToken: fresh } = await gql(REFRESH, { refreshTokenInput: { token: session.refreshToken } })
  const next = { ...session, accessToken: fresh.accessToken, refreshToken: fresh.refreshToken }
  saveSession(next)
  const { profile } = await gql(PROFILE, {}, next.accessToken)
  return accept(next, profile)
}

// Checks a saved sign-in with the backend on page load. Resolves to the session,
// or null when there is none or it has ended. Rejects only when the server can't
// be reached, so a flaky connection doesn't sign anyone out.
//
// Single-flight: React runs effects twice in development, and two tabs can load
// at once. A refresh token is single-use, so two parallel refreshes would race.
let inflight = null
export function restoreSession() {
  inflight ??= (async () => {
    const saved = loadSession()
    if (!saved) return null
    try {
      return await confirm(saved)
    } catch (e) {
      if (e.code === 'NETWORK') throw e
      clearSession()
      return null
    }
  })().finally(() => { inflight = null })
  return inflight
}

export async function signOut() {
  const s = loadSession()
  clearSession()
  if (s?.refreshToken) await revoke(s.refreshToken)
}
