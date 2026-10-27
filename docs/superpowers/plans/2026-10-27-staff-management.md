# Service Guidance and Staff Management Implementation Plan

> **For agentic workers:** Inline execution only (the user requested no subagents). Use regression tests before implementation.

**Goal:** Explain check-in timing at the point of action and let administrators manage staff safely.

**Architecture:** Extend staff_users with a forced-password-change flag and session version; keep account mutations and audit writes inside transactions. Serve staff endpoints through existing server auth/RBAC. Add an admin-only Staff page and a mandatory change-password page for temporary credentials.

**Tech Stack:** PostgreSQL migrations, Node ESM API, React/TanStack Router, Vitest.

## Global Constraints

- Existing first-admin login must continue to work after migration.
- Never log or persist plaintext temporary passwords or return password hashes in API responses.
- Prevent removal/demotion of the last active administrator under concurrent requests.
- Apply migrations before releasing API code; never mutate production while developing/tests run.

---

### Task 1: Account storage, security, and audited mutations

**Files:** `supabase/migrations/002_staff_management.sql`, `server/staff.ts`, `server/staff.test.ts`, `server/auth.ts`, `server/auth.test.ts`.

- [ ] Write failing tests for role validation, unique email, generated temporary passwords, audit write, last-admin guard, and session invalidation.
- [ ] Run focused tests to confirm expected failures.
- [ ] Add migration fields and transactional, parameterized staff operations; keep session-version checks server-side.
- [ ] Run focused tests to confirm green.

### Task 2: API and forced password change

**Files:** `server/app.ts`, `server/app.test.ts`, `src/features/cmams/change-password.tsx`, `src/routes/_authenticated/change-password/index.tsx`, `src/routes/_authenticated/route.tsx`, `src/features/cmams/login.tsx`, `src/lib/cmams-api.ts`.

- [ ] Write failing API tests for admin-only create/list/deactivate/reset/role-change, forced-change restrictions, and reset invalidation.
- [ ] Implement endpoints with CSRF/origin protection already used by the API; return temporary passwords once over no-store HTTPS only.
- [ ] Require a password update before use of other authenticated endpoints; redirect restricted sessions to change-password.
- [ ] Run focused tests, then browser tests.

### Task 3: Staff page and service guidance

**Files:** `src/features/cmams/staff.tsx`, `src/routes/_authenticated/staff/index.tsx`, `src/features/cmams/services.tsx`, `src/components/layout/data/sidebar-data.ts`, `src/features/cmams/access.ts`, `src/features/cmams/*.browser.test.tsx`.

- [ ] Add failing UI tests for admin-only navigation and unavailable open-check-in outside the scheduled window.
- [ ] Implement staff listing, create, role changes, deactivate/reactivate, and reset-password confirmation; provide a copy-once temporary password and never cache it.
- [ ] Hide/disable premature open-check-in with exact local start/end time and specific error feedback.
- [ ] Run full `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm format:check`; verify migration in a disposable DB if available.
