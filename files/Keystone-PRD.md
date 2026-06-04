# Keystone — Product Requirements Document

**Working name:** Keystone (placeholder)
**Version:** 0.1 (draft)
**Owner:** PM
**Status:** Early concept — scope intentionally narrow for v1

---

## 1. Problem

As the PM, you are the single point of context on the project. The client and QA talk to you in Slack; tasks live in ClickUp (where the client is also present); and the *complete* picture of who is waiting on what, what was promised, and what needs to be raised today exists only in your head.

This creates two costs:

1. **Redundant back-and-forth.** You constantly reconstruct state by hand — re-reading threads, cross-checking tasks, remembering who said what.
2. **A single point of failure.** When you are busy, sick, or off, the context goes with you.

Keystone exists to move that context *out of your head* into something persistent and reliable, so you stay the safeguard without being the bottleneck.

---

## 2. Vision

A PM-centric **brain**: a persistent context holder that continuously reads the project's communication and task activity, understands the project through its documentation, and answers the questions you currently answer from memory — *what is the client actually discussing, what is QA doing, what is the state of this task, what is today's agenda, who should take this, who is free.*

Keystone augments the PM as the central node. It never connects the other parties to each other, and it never acts on its own. It makes you faster; it does not stand in front of you.

---

## 3. Goals and non-goals

**Goals**
- Externalize project context into a reliable, queryable store.
- Surface what needs the PM's attention each day, grouped by person and by task.
- Answer natural-language questions about project state, grounded in real documentation.
- Reduce the manual reconstruction of state to near zero.

**Non-goals (v1)**
- Not a shared workspace. Client, QA, and developers do not log in.
- Not a replacement for Slack or ClickUp. Keystone reads them; it does not replace them.
- Not autonomous. The brain proposes; the PM decides.
- Not write-back (v1). Read-only. Acting from inside Keystone is a later phase.

---

## 4. Users

- **Primary user:** the PM (single user in v1).
- **Indirect beneficiaries:** client, QA, and the delivery team — they benefit from a more responsive, less error-prone PM, but they never touch the product.

---

## 5. Core concepts

- **The brain.** The reasoning layer that fuses stable knowledge (docs) with live signal (feeds) and answers questions.
- **The context store.** The persistent, normalized record of items, people, tasks, and their links and statuses — the externalized version of what currently lives in your head.
- **Ground-truth documentation.** The project documentation is the brain's knowledge base. It is what lets Keystone *understand* the project rather than merely summarize recent chatter.
- **The safeguard model.** Keystone suggests; the PM confirms or overrides. Because it is read-only and you remain the decision-maker, a wrong inference costs nothing.

---

## 6. Features and requirements

### F1 — Read-only ingestion *(MVP)*
Connect to Slack and ClickUp with read-only scopes. Capture messages, threads, mentions, tasks, comments, and status changes via webhooks (real-time) with periodic API reconciliation.

### F2 — Documentation grounding *(MVP)*
Ingest project documentation (specs, requirements, decisions, scope) from the **in-house docs portal** — a web portal the team builds and owns. Index it so the brain can retrieve the relevant context when interpreting live activity. This is what turns "noticing" into "knowing." Because the portal is built in-house, it is designed *ingestion-first* (structured content, stable IDs, a content API, and a change feed), which makes grounding cleaner and drift detection (F7) cheaper than any third-party doc tool would allow. See the *Docs Portal — conventions to follow* companion doc.

### F3 — Context Q&A *(MVP)*
Answer natural-language questions about project state — "what is the client circling back on," "what's the status of the login work," "what did we agree on for the payment flow" — grounded in the docs plus live feeds, with citations back to the source message/task/doc.

### F4 — Daily agenda *(MVP)*
Generate a once-a-day briefing: open items needing the PM, grouped by person and by task, with the inferred topic for each. Delivered as a simple view and/or a Slack DM to the PM.

### F5 — Assignment and availability suggestions *(Phase 2)*
Suggest who should take a task and who has capacity. **Dependency:** this requires a workload/capacity signal (current assignments, effort estimates, time tracking, optionally calendars). Quality is bounded by this data — without it, "who is free" is a guess and should be labeled as low-confidence or withheld.

### F6 — Developer KPIs *(Phase 2)*
Surface per-developer signals:
- **Bug ownership / responsibility** — which developer owns the area a bug falls in (derived from task assignment and, ideally, code-ownership data).
- **Escalation load** — "who is getting called" — how often each developer is pulled into incidents or client escalations.
- **Throughput and quality** — cycle time, reopen rate, time-to-resolution.

> **Caveat (read before building F6):** developer metrics are easy to compute and easy to get wrong. Crude metrics (e.g. tickets closed, lines changed) create perverse incentives and damage trust. Treat KPIs as conversation-starters for the PM, never as automated judgments, and prefer team-health signals (where work is piling up, where escalations cluster) over individual scorecards. Make any individual metric visible only to the PM, and pair every number with its context.

### F7 — Drift detection *(Phase 2 / differentiator)*
Flag when the live layer diverges from the documented layer — e.g. "the client just asked for X in Slack, but the spec still says Y." This is the brain guarding the integrity of the project record, and it is the feature most likely to be uniquely valuable. It is also the natural first *write* use case later (proposing a doc update).

---

## 7. Product principles

- **Suggest, don't decide.** Every recommendation is the PM's to accept or reject.
- **Be honest about uncertainty.** A labeled "I'm not sure — the docs don't cover this" beats a confident wrong answer.
- **Cite everything.** Every claim links back to the message, task, or doc it came from, so the PM can verify in one click.
- **The PM is never bypassed.** No feature routes information around the PM.

---

## 8. Roadmap

**MVP** — F1, F2, F3, F4. The smallest useful thing: a daily, grounded briefing plus the ability to ask questions about project state. Built single-user, read-only.

**Phase 2** — F5, F6, F7. Adds the workload signal, developer KPIs, and drift detection.

**Phase 3** — Write-back. Act from inside Keystone (reply, update, assign) with PM confirmation, and propose doc updates from detected drift.

---

## 9. Success metrics

- Time the PM spends reconstructing state per day (target: trends toward zero).
- Share of "what's the status of X" questions answered correctly by the brain without the PM checking the source.
- Number of items that slipped past the PM (target: down).
- Drift issues caught before the client/team noticed (Phase 2).

---

## 10. Open questions

- ~~Where do the project docs live?~~ **Resolved:** an in-house docs portal. The F2 connector is therefore an internal integration the team controls (see Docs Portal companion doc), not a third-party connector.
- Does the team log enough in ClickUp (estimates, time tracking) to make F5/F6 trustworthy, or is a lightweight capacity signal needed first?
- How fresh are the docs today? If they drift, F7 becomes important *earlier*, not later.
- What is the daily-agenda delivery the PM will actually read — a web view, a Slack DM, or both?
