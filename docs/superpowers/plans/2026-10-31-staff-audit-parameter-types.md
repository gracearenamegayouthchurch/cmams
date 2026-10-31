# Staff audit parameter types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve HTTP 503 during staff creation caused by ambiguous PostgreSQL audit parameters.

**Architecture:** Keep staff endpoints and transaction boundaries intact; type-bind role and active-state parameters where PostgreSQL builds JSON audit records. Verify with a targeted SQL-contract test plus a live synthetic-account probe that deactivates any account it creates.

**Tech Stack:** TypeScript, PostgreSQL, Vitest, Vercel.

## Global Constraints

- Do not display or save the generated temporary password, session cookie, database URL, or real staff details.
- Preserve unrelated analytics edits and generated route changes.
- Do not create a real person's account for testing. Disable any synthetic test account immediately and verify status.

---

### Task 1: Staff audit SQL and focused regression

**Files:** Modify `server/staff.ts`, `server/staff.test.ts`.

**Interfaces:** `createStaff` and `updateStaff` retain existing signatures and response shapes; only SQL parameter type inference changes.

- [ ] Add assertions on the audit query exercised by existing create/update tests: creation uses `jsonb_build_object('role',$3::text)`; update uses `jsonb_build_object('role',$3::text,'active',$4::boolean)` and equivalent `$5::text` / `$6::boolean`.
  ```ts
  expect(calls.find(({ sql }) => sql.includes('STAFF_CREATED'))?.sql)
    .toContain("jsonb_build_object('role',$3::text)")
  expect(queries.find((sql) => sql.includes('STAFF_UPDATED')))
    .toContain("jsonb_build_object('role',$3::text,'active',$4::boolean)")
  ```
- [ ] Run `npx vitest run --project server server/staff.test.ts` and confirm the assertions fail on untyped SQL.
- [ ] Add explicit casts in both staff audit SQL statements; rerun focused tests and commit source/test.
  ```sql
  jsonb_build_object('role',$3::text)
  jsonb_build_object('role',$3::text,'active',$4::boolean)
  jsonb_build_object('role',$5::text,'active',$6::boolean)
  ```

### Task 2: Verify and deploy

**Files:** No further source changes unless tests show a concrete issue.

- [ ] Run `npm test`, `npm run build`, `npx eslint server/staff.ts server/staff.test.ts`, Prettier checks and `git diff --check`.
- [ ] Fast-forward the intended `main` checkout without overwriting unrelated files, push `main`, and deploy the committed revision to the linked production Vercel project.
- [ ] Rerun the synthetic live `POST /api/v1/staff` probe with an approved admin session; record only HTTP status and safe error. If it succeeds, deactivate the synthetic account via PATCH or guarded fallback and verify inactive state. Never display the temporary password.
