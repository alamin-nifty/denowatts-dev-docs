---
title: Question log
owner: alamin-nifty
status: living
updated_at: 2026-09-30
---

# Question log

Real questions people have asked about the platform — from customers, support
threads, trainings, and onboarding — and whether the docs could answer them.

**Why this file exists.** Coverage trackers, the closure audit and drift
detection all measure the docs against *the code*. Nothing measured them
against the questions people actually ask. A doc can be complete by every
internal metric and still fail the moment someone needs it. This log is the
demand-side counterpart: it is the spec the docs are written against.

**How to use it.**
- Log every real question, whether or not the docs answered it. The misses
  say what to write next; the hits say which sections are load-bearing.
- A question the docs could not answer is a **regression test**, not a one-off.
  It stays `open` until a doc section answers it, then records where.
- Questions arrive not knowing which module they belong to. That is the point —
  route them here first, then to a flow doc.
- When answering required reading source code, say so. That is the clearest
  signal the docs failed.

Status: `open` (docs still can't answer) · `fixed` (a doc section now answers
it) · `predicted` (nobody has asked yet, but the same gap is visible)

---

## Log

### Q1 — Do "Email" and "Site Managers" both have to be checked?
- **Asked:** 2026-09-07, customer training prep, via client
- **Question:** "If Site Manager is checked, but Email is not checked, then no
  Notification will be delivered? Must both Email and Site Managers be checked
  for a site manager to get an email notification?" Plus the underlying
  assumption: "If Email is checked by a Company Admin, does that mean all users
  in that company get all notification emails?"
- **Could the docs answer it?** **No.** `notification.md` defined every field
  involved (`siteManagers`, `emailNotifications`, `isActive`) but never how
  they compose. The rule is an AND-gate that emerges from the combination, so
  no field's table row owned it. Answer had to be read from backend source.
- **Answer:** Yes, both. Targeting (who) and delivery method (how) are
  independent gates; both must be set. "Email" is a channel switch, not an
  audience — it never widens delivery beyond the targeted users.
- **Status:** `fixed` — [notification.md](notification.md), *How a notification
  rule fires* (business) + *Business rules (cited)* and *Edge cases* (dev).
- **Root cause:** field-level documentation with no composition rules. See the
  same gap in Q2.

### Q2 — Does "notify support" depend on the notification grid?
- **Asked:** not yet — surfaced while fixing Q1
- **Question:** if a company's alarm rows are all disabled, does Denowatts
  support still get alarm emails?
- **Could the docs answer it?** **No.** `alarm-config.md:275` documents
  `notifySupport` as "If true, DenoWatts support is CC'd on alarm emails" with
  no mention that it bypasses the notification grid entirely and is
  environment-gated (in non-production, support is *always* included
  regardless of the flag).
- **Answer:** No — support still gets the email. Notify Support is applied
  *after* the company rows are worked out, so it bypasses the grid entirely and
  can be the only reason an alarm email is sent. And on test or staging systems
  support is copied on **every** alarm email whether or not the box is ticked;
  only the live system honours it.
- **Status:** `fixed` — [alarm-config.md](alarm-config.md), *When Denowatts
  support gets copied* + *What produces nothing* (business), and the corrected
  dispatch walkthrough + *Business rules (cited)* (dev).
- **Note:** the doc previously contradicted itself — the business summary had
  the test-environment behaviour right, the developer section said support was
  copied "only in production and only when `notifySupport` is true", which
  omitted the unconditional non-production branch. Corrected against
  `webhook.service.ts:196-202`.

### Q3 — I changed a rule's threshold and nothing happened. Why?
- **Asked:** not yet — surfaced while fixing Q2
- **Question:** an administrator edits Threshold, Suppression, Delay or
  Condition on Global Alarm Configuration and expects alarms to start or stop
  firing differently.
- **Could the docs answer it?** Partly. `alarm-config.md` said evaluation
  happens upstream, but never listed which columns on the screen are inert
  here, so the reader had to infer it.
- **Status:** `fixed` — [alarm-config.md](alarm-config.md), *Which settings on
  this screen actually change anything*. **Open sub-question for a human:**
  whether the upstream pipeline picks these edits up at all, and how quickly,
  is still unconfirmed.

### Q4 — We switched our alarm row off, so why did our site manager still get an email?
- **Asked:** not yet — surfaced while fixing Q2
- **Question:** a company disables its Critical row and a site manager is still
  emailed about a critical alarm.
- **Could the docs answer it?** **No.** Alarm dispatch loads the site's owner
  company *plus every company with access to the site*
  (`webhook.service.ts:63-110`) and merges the recipients from all of them. No
  doc said the grid is consulted per-company-with-access rather than just for
  the owner.
- **Status:** `fixed` — [alarm-config.md](alarm-config.md), *Who gets an email
  when an alarm opens*; [notification.md](notification.md) already carried the
  rule and now links back to [alarm-config.md](alarm-config.md) for it.

### Q5 — Client is seeing a raw `@[Name](id)` mention in comment-notification emails instead of "@Name" — how do we reproduce it?
- **Asked:** 2026-09-17/18, Slack support thread (Kevin Suhr, re: event comment
  from Kevin Suhr mentioning Owen Clyne). Screenshot showed the literal text
  `@[Owen Clyne](6a2af85dc5284bad9a083eac-:r1u6:)` in the email body.
- **Could the docs answer it?** **No.** `events.md`'s Comments & mentions
  section documented the happy-path mention format (`@[Name](userId)` →
  cleaned to `@Name`) but never what happens when the id half of that token
  is malformed — the single highest-value "what produces nothing/wrong output"
  question for this feature, per CLAUDE.md rule 8. Answer required reading
  both `denowatts-backend/src/events/comments.service.ts` and
  `denowatts-portal/src/features/events-feed/components/MentionInput.tsx`,
  plus git log/diff across branches.
- **Answer:** the backend's mention regex (`/@\[([^\]]+)\]\(([a-f0-9]{24})\)/g`,
  `comments.service.ts:52` and `:192`) requires the id to be *exactly* 24
  lowercase-hex characters — one extra character anywhere breaks the whole
  match (not a partial one), so the raw markdown token is left untouched and
  gets interpolated unescaped into the email HTML. Root cause: the frontend's
  `MentionInput.tsx` used antd `Mentions`' `onSelect` `option.key` as the
  user id instead of resolving it from the known user list; that `option.key`
  is not reliably a clean Mongo id (the corrupted example had a `-:r1u6:`
  suffix appended). Already fixed upstream 2026-09-16, commit `55d0cb1d7` on
  `origin/main` (mirrored on `dev` and `release/1.600.0`) — not yet in this
  checkout's `denowatts-portal` (87 commits behind at the time of asking).
  Reproducible deterministically without the UI by calling `createComment`
  directly with a hand-crafted malformed-id mention — proving the backend has
  no defense-in-depth for this even after the frontend fix ships. Full
  analysis, all 5 repro scenarios, and citations: [events.md](events.md),
  *Edge cases & gotchas* — "Malformed mention token leaks into the email
  verbatim."
- **Status:** `fixed` — [events.md](events.md), *Edge cases & gotchas*.
  **Open item for a human:** the backend regex still has no fallback for a
  malformed id (would keep failing the same way on any future regression or
  hand-crafted input); worth a defense-in-depth fix separate from the
  frontend patch. Also unrelated-but-adjacent: `generateEmailContent`
  interpolates comment content into the email HTML unescaped
  (`comments.service.ts:234–245`) — not exploited by this bug, but flagged
  during the investigation.
- **Root cause:** same pattern as Q1/Q2 — the docs recorded the field/format
  but not what breaks it. Here the "what produces nothing" gap was a missing
  id-validation contract between frontend and backend, not a settings
  combination.

### Q6 — Quote questions support will get after the September 2026 quote redesign
- **Asked:** not yet — logged 2026-09-30 while refreshing [quote.md](quote.md)
  (v3 → v4) against the redesigned code. The v3 doc was written before three
  quote types, the one-page form, fixed shipping and the setup-fee waiver
  existed, so it would have answered each of these wrongly.
- **Questions this refresh now answers:**
  1. "We shipped the add-on quote — why didn't the customer's plan get
     longer?" → Add-on quotes change nothing on the sites when shipped.
     *The three kinds of quote*, *What shipping switches on*.
  2. "Why is the setup fee $0 on this quote but not that one?" → waived only
     on a 5-year term. *How service level and contract length work together*.
  3. "Where do I type a discount / change shipping?" → you can't; shipping is
     always $100. *How the price is worked out*.
  4. "I ticked VPN on the multi-site grid, why isn't it on the quote?" →
     priced but not saved. *What produces nothing*.
  5. "The customer signed but it still says Waiting for Signing." → the
     browser must report the signature; closing the tab early leaves it stuck.
     *What produces nothing*, [e-signature.md](e-signature.md).
  6. "I removed a site from the renewal, why is the total the same?" →
     edits never remove sites. *What produces nothing*.
- **Status:** `predicted` — each answered in [quote.md](quote.md). Promote to
  a real entry when someone actually asks.
- **Open items for a human (from the same refresh):** customers can re-price
  a renewal/add-on quote after signing; renewal plan type is taken from the
  first site for all sites; renewal pre-fill checks `BASIC` for the product
  but `ESSENTIAL_WEATHER` for the tier/term. See quote.md *Edge cases &
  gotchas*.
- **Root cause:** doc drift, not a missing section — a large feature rewrite
  landed (8 backend + ~20 portal commits, 2026-09-01 → 09-29) with no doc
  update. The drift detector flagged it; nothing consumed the flag.

---

## Recurring root causes

Patterns behind the misses, so the next doc pass has targets rather than
"be more thorough":

1. **Composition is unowned.** Where 2+ settings jointly determine an outcome,
   each field gets a table row and the *combination* gets nothing. Fix: a
   "how these settings combine" section with a truth table. (Q1, Q2)
2. **Only the happy path is documented.** "Which configurations produce
   silence?" is the highest-value question in any config doc and is rarely
   asked. Fix: enumerate the silent states. (Q1)
3. **Behavior crosses module boundaries; docs don't.** The alarm-email rule
   spans notification / alarm-config / webhooks / site. Each doc is internally
   complete; the behavior is owned by none. Fix: name an owning doc and link
   inward from the others. (Q1, Q2)
4. **The Business/Developer split divides on vocabulary, not question type.**
   Correct answers that exist only in `{dev}` mode fail the business readers
   who actually ask. Fix: business mode carries the *rule*, dev mode carries
   the citation.
