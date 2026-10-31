# First-timer SMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce an admin-controlled, disabled-by-default welcome SMS workflow and a reusable BulkSMSNigeria outbox.

**Architecture:** Registration creates exactly one welcome outbox entry in its transaction when a valid phone exists. Admins edit a singleton template, mode (manual, immediate, daily Lagos time), and live enablement; manual sending claims one entry. An authenticated external scheduler calls a separate worker; it atomically claims due entries, sends server-side, and records results without exposing credentials. Unknown delivery outcomes are not automatically retried to avoid duplicates.

**Tech Stack:** TypeScript, PostgreSQL, Vitest, React, BulkSMSNigeria v2, Vercel Functions.

## Global Constraints

- No new SMS opt-in checkbox.
- No live sends or production migration without provider credentials and explicit rollout.
- Existing worktree `C:\Users\MAFUYAI\Documents\cmams-v1-sms` must stay isolated; don't overwrite analytics in the main checkout.
- Sunday's/event campaign creation and code delivery remain future workflows using the shared outbox.

---

### Task 1: Persistence and queue tests

**Files:** Create `supabase/migrations/011_sms_outbox.sql`, `server/sms.ts`, `server/sms.test.ts`; modify `server/people.ts`.

**Interfaces:** `queueWelcome(client, personId, phone, firstName)`, `getSmsSettings(db)`, `updateSmsSettings(db,input,actor)`, `listWelcomeMessages(db)`, `queueManualWelcome(db,id,actor)`, `processSmsOutbox(db,send)`. Settings default MANUAL + disabled; job status HELD, PENDING, PROCESSING, SENT, FAILED, UNCERTAIN.

- [ ] Write failing tests for Lagos daily-time rollover, registration enqueue, manual guards, idempotency, and atomic claims.
- [ ] Run `pnpm exec vitest run --project server server/sms.test.ts` to see missing behavior.
- [ ] Add schema, SQL queue and worker, rerun focused tests.

### Task 2: API and provider boundary

**Files:** Modify `server/app.ts`, add `server/sms-provider.ts`, `server/sms-provider.test.ts`, `server/app.test.ts`.

- [ ] Test admin authorization, worker secret authorization, disabled sending, and provider request/response failures.
- [ ] Run focused server tests to confirm failure before implementation.
- [ ] Implement admin endpoints and worker token route; provider uses environment-only bearer token and sender ID. No credential values in API responses/logs. Worker uses POST with secret in Authorization and no browser session.
- [ ] Rerun focused tests.

### Task 3: Admin welcome controls and setup documentation

**Files:** Create `src/features/cmams/welcome-sms.tsx`, modify `src/features/cmams/first-timers.tsx`; add `docs/sms-setup.md`.

- [ ] Add UI test for manual-by-default, admin-editable message and time, queue review/send, and disabled-live state; confirm failure.
- [ ] Render admin settings panel on First-Timers page; implement save, manual send and status refresh.
- [ ] Document migration, BulkSMSNigeria token/sender ID, scheduler minute interval/worker secret, Lagos timezone, safe test/enable procedure, and follow-on workflows.
- [ ] Run full tests, build, lint, `git diff --check`; do not deploy or enable production SMS without a confirmed account/scheduler.
