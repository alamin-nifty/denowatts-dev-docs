---
title: Authentication
owner: alamin-nifty
status: approved
version: 3
updated_at: 2026-06-04
---

# Authentication

Authentication is the front door to the DenoWatts portal. It decides **who gets in, what they're allowed to see, and for how long**. Everything else in the product sits behind it.

In plain terms: a person creates an account, proves they own their email, and then signs in. From that point on they carry a short-lived "pass" (an access token) that the backend checks on every request. Their role and their company decide what they can actually do once inside.

---

## The rules that matter

These are the business rules worth knowing before anything else — the *why* behind the screens.

**Accounts start locked.** A brand-new account is `PENDING` until the person clicks the verification link in their email. They can't sign in until they do — and if they try, the system quietly re-sends the link instead of letting them through. — `denowatts-backend/src/auth/auth.service.ts`

**Three kinds of account states.** `PENDING` (email not yet confirmed), `ACTIVE` (good to go), and `DELETED` (soft-deleted — the record stays for compliance, but the person is told the account no longer exists). Only `ACTIVE` users can log in. — `denowatts-backend/src/users/schemas/user.schema.ts`

**Three levels of access.** `USER` is read-only, `ADMIN` manages their own company, and `SUPER_ADMIN` can do everything across every company. A SuperAdmin always passes a permission check, no matter what. — `denowatts-backend/src/common/guards/roles.guard.ts`

**Everyone is scoped to their company.** Unless you're a SuperAdmin, you only ever see your own company's data — that boundary is enforced on the backend, not just hidden in the UI. — `denowatts-backend/src/users/users.service.ts`

**Passwords are held to a standard.** Minimum 8 characters, always stored as an Argon2 hash, never plain text. Older accounts still on a legacy MD5 hash are silently upgraded to Argon2 the next time they log in successfully — so security improves without anyone noticing. — `denowatts-backend/src/auth/auth.service.ts`

**We don't leak who has an account.** "Forgot password" always responds with the same success message, even if no account uses that email. Same idea protects sign-up. This stops outsiders from fishing for valid email addresses. — `denowatts-backend/src/auth/auth.service.ts`

**Verification emails can't be spammed.** A person can re-request the confirmation email only on a back-off schedule — 2, then 5, then 15, then 60 minutes — capped at 5 times a day. — `denowatts-backend/src/auth/auth.service.ts`

**Joining a company can be automatic.** When someone verifies their email, if their email domain matches a company that owns that domain, they're auto-assigned to it. No manual invite needed for known domains. — `denowatts-backend/src/auth/auth.service.ts`

**Sessions are deliberately short.** The access token lasts 1 day in production (1 hour in dev) and is refreshed silently in the background using a 7-day refresh token. So people stay logged in for a week of activity, but a stolen access token is only useful briefly. — `denowatts-backend/src/auth/auth.service.ts`

**Every token knows its job.** Tokens are stamped with a type — `AUTH` for normal sessions, `CONFIRM_EMAIL` for verification links, `RESET_PASSWORD` for reset links — and each one only works for its own purpose. A reset link can't be used to log in. — `denowatts-backend/src/auth/enums/auth.enum.ts`

---

## Where it lives

The screens a person actually touches, all under `denowatts-portal/`:

- **Sign in** — `/signin`
- **Sign up** — `/signup`
- **"Check your email" holding page** — `/signup/verification`
- **Email verification (from the link)** — `/signup/verify`
- **Forgot password** — `/reset-password`
- **Set a new password (from the link)** — `/reset-password/verify`

---

## Who can open what

Logging in is only the first gate — the frontend also fences off whole areas by role and company. Each guard quietly redirects anyone who isn't allowed:

- **SuperAdmin-only areas** are wrapped in `ProtectedRoute`. A non-SuperAdmin is sent to *not-found*; a signed-out visitor goes to sign in (with their target page remembered). — `denowatts-portal/src/views/ProtectedRoute/ProtectedRoute.tsx`
- **Admin-and-up areas** are wrapped in `NonUserRoute`. Read-only `USER` accounts are turned away to *not-found*. — `denowatts-portal/src/views/ProtectedRoute/NonUserRoute.tsx`
- **Company-required areas** are wrapped in `CompanyRequiredRoute`. You need a company assigned — though SuperAdmins are exempt, and Quote Management (`/settings/quote-management`) is deliberately allowed without one. — `denowatts-portal/src/views/ProtectedRoute/CompanyRequiredRoute.tsx`

In every case a signed-out visitor has their intended URL remembered before being bounced to sign in — that's the "remembered in-app page" the login step sends them back to.

---

## How it works {dev}

### Signing up

1. The person fills in their name, email, phone (validated as 8–15 digits), and password. — `denowatts-portal/src/pages/auth/signup/components/SignupForm.tsx`
2. If reCAPTCHA is switched on, they pass that first; the backend double-checks it with Google. — `denowatts-backend/src/auth/auth.service.ts`
3. The backend hashes the password, creates a `PENDING` account, and emails a 1-day verification link. — `denowatts-backend/src/auth/auth.service.ts`
4. They land on a "check your email" page. — `denowatts-portal/src/pages/auth/signup/verification-message/components/VerificationMessageForm.tsx`
5. Clicking the link confirms the account (`PENDING → ACTIVE`) and runs the company auto-assignment. — `denowatts-backend/src/auth/auth.service.ts`

### Fixing a wrong email

Typed the wrong address? The "check your email" page has a **Change** option. The person enters a new email, the still-pending account is updated on the spot, and a fresh 1-day verification link is sent to the new address. It only works while the account is still `PENDING`. — `denowatts-portal/src/pages/auth/signup/verification-message/components/VerificationMessageForm.tsx`, `denowatts-backend/src/auth/auth.service.ts`

### Logging in

1. The person enters email and password. — `denowatts-portal/src/pages/auth/login/components/LoginForm.tsx`
2. The backend checks the account state first — deleted and pending accounts are turned away with the right message. — `denowatts-backend/src/auth/auth.service.ts`
3. The password is verified (Argon2, or legacy MD5 with an automatic upgrade). — `denowatts-backend/src/auth/auth.service.ts`
4. On success, the backend issues an access token + refresh token and records `lastLoginAt`. — `denowatts-backend/src/auth/auth.service.ts`
5. The frontend stores both tokens and applies the person's saved theme. — `denowatts-portal/src/store/slices/authSlice.ts`

### Where you land after login

Once signed in, the app picks a destination in this priority order — `denowatts-portal/src/pages/auth/login/components/LoginForm.tsx`:

1. **Back to another app (cross-origin).** If the page was opened with a `?redirect=<url>` from an allow-listed origin (e.g. the reports app), the person is sent there with their tokens handed over in the URL hash, so they don't have to log in twice. (An already-signed-in person who lands on `/signin` with that param is forwarded the same way.)
2. **A remembered in-app page.** If a route guard stashed a path before bouncing them to sign in, they're returned to exactly that page.
3. **Default — HubSpot SSO.** Otherwise they're sent to the SSO URL with their JWT attached.

### Staying logged in

1. When an access token expires, the next request comes back as `UNAUTHENTICATED`. — `denowatts-portal/src/main.tsx`
2. The app quietly swaps in a fresh access token using the refresh token, then retries — the person never notices. — `denowatts-backend/src/auth/auth.service.ts`
3. If the refresh token is dead too, they're logged out and sent to `/signin`. — `denowatts-portal/src/store/slices/authSlice.ts`

### Resetting a password

1. The person asks for a reset on `/reset-password`. — `denowatts-portal/src/pages/auth/reset-password/components/ResetPasswordForm.tsx`
2. If the account exists, a 1-day reset link is emailed (the response is the same either way). — `denowatts-backend/src/auth/auth.service.ts`
3. The link opens a "set new password" form; the backend checks the token is a real `RESET_PASSWORD` token, then saves the new Argon2 hash. — `denowatts-portal/src/pages/auth/change-password/components/ChangePasswordForm.tsx`

### One-time passwords (OTP)

A separate 6-digit code flow, valid for 5 minutes, used where a short-lived code is needed. The code is stored with a self-expiring timer and deleted once used. — `denowatts-backend/src/auth/schemas/otp.schema.ts`

---

## Data it touches {dev}

- `users.email` — the identity key; unique and always lowercase. — `denowatts-backend/src/users/schemas/user.schema.ts`
- `users.password` — Argon2 hash (or legacy MD5); never returned in normal queries.
- `users.status` — `PENDING` → `ACTIVE` → (`DELETED`). Drives who can log in.
- `users.type` — the access level (`USER` / `ADMIN` / `SUPER_ADMIN`).
- `users.company` — links the person to their company; set during verification when the domain matches.
- `users.lastLoginAt` / `users.lastActiveAt` — activity timestamps, updated on login and on every token refresh. — `denowatts-backend/src/auth/auth.service.ts`
- `users.verificationAttempts` / `users.lastVerificationSent` — power the resend rate-limit. — `denowatts-backend/src/auth/auth.service.ts`
- `otps.*` — short-lived OTP records that delete themselves after 5 minutes. — `denowatts-backend/src/auth/schemas/otp.schema.ts`

---

## Edge cases & gotchas {dev}

- **A wrong password on a pending account still sends a verification email** — and the message is "please verify your email," not "wrong password." Worth knowing when debugging a login complaint. — `denowatts-backend/src/auth/auth.service.ts`
- **Tokens live in `localStorage`**, so they're readable by JavaScript — which makes cross-site scripting (XSS) the main risk to guard against. — `denowatts-portal/src/store/slices/authSlice.ts`
- **The refresh token isn't rotated.** Each refresh returns a new access token but the *same* refresh token — flag for a security review if that wasn't intentional. — `denowatts-backend/src/auth/auth.service.ts`
- **Company auto-assignment only runs at verification.** If a matching company is added *after* someone signs up, they won't be back-filled into it automatically.
- **The OTP flow isn't tied to login.** It stands on its own; whatever calls it has to handle the session afterwards. *(Unclear which screen triggers it — flag for human review.)*

---

**Related flows:** *(none yet — permissions/roles is the natural next doc to write)*
