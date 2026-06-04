# Authentication — coverage tracker

**Doc:** [authentication.md](./authentication.md)
**Status:** documented · 100% · last verified 2026-06-04
**How to use:** read ONLY the files listed below to re-verify — not the whole repo.
Tick a box when the item is covered in the doc *and* checked against the cited file.

---

## Source files (the only files to read for this feature)

### Frontend — `denowatts-portal/src/`
- `router.tsx` — auth routes (`/signin`, `/signup`, `/signup/verify`, `/signup/verification`, `/reset-password`, `/reset-password/verify`)
- `pages/auth/login/components/LoginForm.tsx`
- `pages/auth/signup/components/SignupForm.tsx`
- `pages/auth/signup/email-verification/components/EmailVerificationForm.tsx`
- `pages/auth/signup/verification-message/components/VerificationMessageForm.tsx`
- `pages/auth/reset-password/components/ResetPasswordForm.tsx`
- `pages/auth/change-password/components/ChangePasswordForm.tsx`
- `store/slices/authSlice.ts`
- `graphql/mutations/auth.ts`
- `main.tsx` — Apollo link chain (token refresh on `UNAUTHENTICATED`)
- `views/ProtectedRoute/{ProtectedRoute,CompanyRequiredRoute,NonUserRoute}.tsx`

### Backend — `denowatts-backend/src/`
- `auth/auth.resolver.ts` — all 11 mutations
- `auth/auth.service.ts` — business logic
- `auth/jwt.strategy.ts` — token validation
- `auth/dto/auth.input.ts` — input validation
- `auth/enums/auth.enum.ts` — `JWTType`
- `auth/schemas/otp.schema.ts` — OTP TTL
- `users/schemas/user.schema.ts` — user model + enums
- `users/users.service.ts` — company-scoped queries, `updatePassword`
- `common/guards/{auth,roles}.guard.ts`
- `common/decorators/{public,private,roles,current-user}.decorator.ts`

---

## Checklist

### Mutations — `auth/auth.resolver.ts`
- [x] `login`
- [x] `refreshToken`
- [x] `signUp`
- [x] `confirmEmail`
- [x] `forgetPassword`
- [x] `changePassword`
- [x] `requestForOtp`
- [x] `verifyOtp`
- [x] `resendVerification`
- [x] `updateEmailForVerification` — covered in *How it works → Fixing a wrong email*
- [~] `validateUser` (internal JWT helper) — implied, not named

### Business rules — `auth.service.ts` / `dto` / `user.schema.ts`
- [x] Account states `PENDING` / `ACTIVE` / `DELETED`
- [x] Access levels `USER` / `ADMIN` / `SUPER_ADMIN` + SuperAdmin bypass
- [x] Company scoping enforced on backend
- [x] Password 8-char min + Argon2 + legacy MD5 auto-upgrade
- [x] Email-enumeration protection (forgot-password always "success")
- [x] Resend back-off (2/5/15/60 min) + daily cap 5
- [x] Company auto-assign by email domain on verification
- [x] Token expiry (1h dev / 1d prod access; 7d refresh)
- [x] Token types (`AUTH` / `CONFIRM_EMAIL` / `RESET_PASSWORD`)
- [x] reCAPTCHA (optional)
- [x] Phone format 8–15 digits — covered in *Signing up* step 1

### Frontend flows & access control
- [x] Sign in / Sign up / Verify / Forgot / Reset flows
- [x] Token-refresh interceptor (`main.tsx`)
- [x] Theme applied on login
- [x] Login redirect behavior — covered in *How it works → Where you land after login*
- [x] Change-email-before-verifying flow — covered in *How it works → Fixing a wrong email*
- [x] Frontend route guards — covered in *Who can open what* (`ProtectedRoute`, `NonUserRoute`, `CompanyRequiredRoute`)
- [~] `JwtAuthGuard` / `@Public` / `@Private` — implied, not named

### Data touched
- [x] `users.*` (email, password, status, type, company, lastLoginAt, lastActiveAt, verificationAttempts, lastVerificationSent)
- [x] `otps.*` (5-min TTL)

### Edge cases
- [x] PENDING + wrong password → "verify email" message
- [x] Tokens in `localStorage` (XSS surface)
- [x] Refresh token not rotated
- [x] Company auto-assign only at verification time
- [x] OTP flow standalone (trigger screen unknown — flagged)

---

## Open gaps
None. All flows, mutations, rules, and guards covered as of 2026-06-04 (doc v3).
Only `[~]` items remain — internal helpers (`validateUser`, `JwtAuthGuard`/`@Public`/`@Private`)
that are intentionally implied rather than spelled out, as they're plumbing, not behavior.

Legend: `[x]` covered · `[ ]` gap · `[~]` partial/implied
