# Cell location assignment and service verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create Across Region 9 and Ndar Region 8 without fake locations; permit assigned leaders to set their own location; verify service creation.

**Architecture:** An additive SQL migration permits NULL meeting locations and idempotently seeds only the two groups. Existing admin/pastor cell mutations accept optional locations; a distinct location-only endpoint enforces current leader assignment server-side. The cell page exposes the narrow action, and targeted server/browser tests cover permission and service flows.

**Tech Stack:** PostgreSQL Supabase migrations, TypeScript, React, Zod, Vitest server and browser.

## Global Constraints

- Do not mutate any other production records or create a production service for testing.
- Keep unrelated `src/routeTree.gen.ts` edits and unrelated main-checkout edits untouched.
- Apply the migration to the intended database before deploying code that writes NULL locations.
- Do not expose real member records or credentials in logs or tests.

---

### Task 1: Nullable locations and two new cells

**Files:** Create `supabase/migrations/010_optional_cell_location.sql`; modify `server/cells.test.ts`, `server/cells.ts`.

**Interfaces:** Existing `createCell(db,input,actor)` and `updateCell(db,id,input,actor)` store `null` for missing/blank `location`; nonblank text is trimmed. SQL migration uses `ON CONFLICT (name) DO NOTHING` and checks mismatched existing regions.

- [ ] Write tests for creation and edit with absent/blank location (database param is NULL), existing nonblank location preserved, and region and name validation.
- [ ] Run `npx vitest run --project server server/cells.test.ts`; confirm failure for missing location.
- [ ] Change Zod cell location field to optional trimmed string (empty to NULL); add migration: `ALTER TABLE cells ALTER COLUMN meeting_location DROP NOT NULL;` and two `INSERT ... VALUES ('Across Region 9',NULL,'ACROSS'),('Ndar Region 8',NULL,'NDAR') ON CONFLICT (name) DO NOTHING`. Check pre-existing duplicate names with wrong regions and raise SQL exception rather than overwrite.
- [ ] Rerun focused tests and commit these files.

### Task 2: Restricted leader location update

**Files:** Modify `server/cells.test.ts`, `server/cells.ts`, `server/app.ts`, `server/app.test.ts`.

**Interfaces:** `updateCellLocation(db,cellId,input,actor)` validates `z.uuid()` and `z.object({location:z.string().trim().min(1).max(200).optional()}).strict()` with a required nonblank value; `PATCH /api/v1/cells/:id/location` calls it. Leaders require active current assignment; admins/pastors allowed; other roles denied. Returns updated cell row and audit log on success.

- [ ] Write tests for own-cell allowed, other-cell/unassigned/archived denied, failed transaction rollback, extra field rejected, and admin/pastor allowed. Ensure unauthorized requests never update DB.
- [ ] Run focused server tests; confirm red.
- [ ] Implement transaction-scoped assignment verification and location update with row guard, audit and transaction cleanup. Add route before the existing members/leader routes; no change to full-edit permission.
- [ ] Run server tests and commit.

### Task 3: Cell interface for optional location

**Files:** Modify `src/features/cmams/cells.tsx` and `src/features/cmams/cmams.browser.test.tsx`.

**Interfaces:** `Cell.meeting_location: string | null`; render `Location not assigned`. Admin/pastor create and edit without required location; assigned leader edits only location via `PATCH /api/v1/cells/:id/location`; use existing `act` helper for query invalidation and messages.

- [ ] Add browser tests for empty location create/render and leader location edit; ensure leader never sees full edit/creation controls.
- [ ] Run browser focused tests; confirm red.
- [ ] Implement UI and types, including `setLocation(selected.meeting_location ?? '')` for full edit and separate leader-only form; run browser tests; commit.

### Task 4: Verify service creation and delivery

**Files:** Modify `server/services.test.ts`, `server/app.test.ts`, `src/features/cmams/cmams.browser.test.tsx` as necessary.

**Interfaces:** Existing `createService` and `POST /api/v1/services`; do not change production behavior unless tests expose a demonstrated defect.

- [ ] Add synthetic server test asserting authorized create inserts and returns expected service; invalid closing time and unauthorized role do not insert. Add browser test confirming valid form posts schedule payload and shows success.
- [ ] Run focused tests, fix only demonstrated service defects, rerun, and commit.
- [ ] Run `npm test`, `npm run build`, focused lint and Prettier for changed files, `git diff --check`; report unrelated failures. Deploy only after DB migration is applied, and confirm two cell groups through a non-sensitive count/name check. No production service creation.
