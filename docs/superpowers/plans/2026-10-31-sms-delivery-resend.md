# SMS Delivery Status and Safe Resend Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give admins a dedicated SMS page with final provider delivery status and a guarded resend action.

**Architecture:** Extend the outbox with delivery state and attempt history. The provider adapter queries delivery reports; the server refreshes status and permits resend only after the latest attempt is confirmed failed. The SMS page replaces the first-timers panel and is visible only to admins.

## Constraints

- Never resend a delivered, pending, processing, sent-awaiting-status, or uncertain message.
- Record every resend attempt and keep the original message body fixed.
- Do not expose phone numbers outside the existing admin UI or put credentials in client code.

### Task 1: Delivery tracking and guarded resend

**Files:** Create `supabase/migrations/012_sms_delivery_attempts.sql`, `server/sms-delivery.test.ts`; modify `server/sms.ts`, `server/sms-provider.ts`, `server/sms-provider.test.ts`, `server/app.ts`, `server/app.test.ts`.

**Interfaces:** `refreshDelivery(db,id,report)` maps provider `delivrd|delivered|success` to `DELIVERED`, known failure codes to `FAILED`, everything else to `PENDING`. `resendWelcome(db,id,actor,send)` requires latest attempt `FAILED`; it records a new attempt and returns `SENT`, `UNCERTAIN`, or `FAILED`. Routes: `GET /api/v1/sms/welcome` includes delivery state and attempts; `POST /api/v1/sms/welcome/:id/refresh`; `POST /api/v1/sms/welcome/:id/resend`.

- [ ] Test delivered/pending/failed mapping, resend denial for non-failed, successful failed resend, provider lookup, and admin authorization.
- [ ] Run focused tests and confirm failure.
- [ ] Add migration with attempt table, delivery status, refresh and resend implementation, provider report query, and routes.
- [ ] Rerun focused tests.

### Task 2: Dedicated SMS admin page

**Files:** Create `src/features/cmams/sms.tsx`, `src/routes/_authenticated/sms/index.tsx`; modify `src/features/cmams/first-timers.tsx`, `src/features/cmams/welcome-sms.tsx`, sidebar data and access tests.

- [ ] Add failing browser/access tests for admin-only SMS navigation, delivery status, refresh, and resend confirmation.
- [ ] Implement the page, move settings/queue UI out of First-Timers, add nav entry, regenerate route tree.
- [ ] Run full tests, build, lint, commit and deploy; verify `/sms` returns 200 and unauthenticated SMS API calls return 401. Do not trigger a paid resend in production.
