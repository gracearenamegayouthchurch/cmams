# Service edit and cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow authorized staff to edit scheduled services and cancel them without deleting attendance history.

**Architecture:** Reuse `validateService` and the existing services capability; add guarded transactional update/cancel operations and audit entries. The Services page adds a prefilled edit form and a destructive confirmation that invokes cancellation. Canceled services remain in the database and are excluded by the existing list query.

**Tech Stack:** TypeScript, PostgreSQL, Zod, React, Vitest server/browser, Vercel.

## Global Constraints

- Never hard-delete a service, or modify a service after opening/closing or with attendance.
- Preserve current open/close flows, check-in history, and all unrelated analytics and routeTree changes.
- Use only synthetic records for a production smoke test; disable any synthetic account after testing, and do not log credentials.

---

### Task 1: Server-side edit and cancellation

**Files:** Modify `server/services.ts`, `server/services.test.ts`, `server/app.ts`, `server/app.test.ts`.

**Interfaces:** `editService(db,id,input,staffId)` and `cancelService(db,id,staffId)` return a service, throw `ServiceTransitionError` with code `SERVICE_NOT_EDITABLE` for ineligible/missing IDs. Routes `PATCH /api/v1/services/:id`, `POST /api/v1/services/:id/cancel` return `{service}` on success, 409 on transition conflicts, 403 without `services` capability, 400 for validation errors.

- [ ] Add failing tests for edit and cancel of scheduled service, untouched attendance/open/closed/canceled services, rollback on audit failure, input validation, route permissions and response status.
  ```ts
  await expect(editService(db, id, validInput, actor)).resolves.toMatchObject({ name: 'Updated service' })
  await expect(cancelService(db, id, actor)).resolves.toMatchObject({ status: 'CANCELLED' })
  ```
- [ ] Run `npx vitest run --project server server/services.test.ts server/app.test.ts` and confirm failure because edit/cancel do not exist.
- [ ] Implement guarded `UPDATE services ... WHERE id=$1 AND status='SCHEDULED' AND NOT EXISTS(SELECT 1 FROM attendance_records WHERE service_id=$1) RETURNING ...`; inside one DB transaction insert a `SERVICE_UPDATED` or `SERVICE_CANCELLED` audit row, commit or roll back. Reuse `validateService` for edit. Add routes and conflict mapping.
- [ ] Rerun focused tests, format and commit only task files.

### Task 2: Service page edit and cancel actions

**Files:** Modify `src/features/cmams/services.tsx`, `src/features/cmams/cmams.browser.test.tsx`.

**Interfaces:** `Service` fields from `src/features/cmams/types.ts` provide prefill dates. PATCH sends `{name,category,scheduledStartAt,opensAt,closesAt}` and cancel POST sends `{}`. Query invalidation refreshes service list.

- [ ] Add browser tests for opening the edit form with existing values, saving new values, confirming cancellation and removing the canceled service, and no controls for open/closed services.
  ```ts
  await userEvent.click(screen.getByRole('button', { name: 'Edit service' }))
  await expect.element(screen.getByLabelText('Edit service name')).toHaveValue('Sunday Service')
  ```
- [ ] Run focused browser tests and confirm failures on absent controls.
- [ ] Add edit state and a prefilled form with `DateTimePicker`; validate required times and `closes > opens`. Reuse mutation/query invalidation; show a confirmation for cancel, and render Edit/Delete only for `SCHEDULED` services.
- [ ] Rerun browser tests, format and commit.

### Task 3: Verify, deploy, and safely smoke-test

**Files:** No production source beyond task changes.

- [ ] Run `npm test`, `npm run build`, changed-file ESLint/Prettier and `git diff --check`; report any unrelated failure accurately.
- [ ] Integrate only these commits into `main` without staging unrelated edits, push, and deploy to the linked Vercel project.
- [ ] If test credentials are available, create a uniquely named synthetic supervisor and service, edit then cancel only that service, verify it is absent from active list and still has `CANCELLED` in the DB, deactivate the synthetic supervisor, and verify no active synthetic account remains. Never print generated credentials or member details.
