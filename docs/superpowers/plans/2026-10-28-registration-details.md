# Registration Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This project owner requested **no subagents**; execute inline.

**Goal:** Register a person with required email, compound and birthday month/day, optional birthday year, room and one department while preserving consent, duplicates and card issuance.

**Architecture:** Add nullable columns and a unique-current-department constraint after preflight. Validate and write data transactionally in `server/people.ts`; expose authenticated catalogs through `server/app.ts`; use controlled fields on `src/features/cmams/desk.tsx`. An optional cell picker is a follow-up in the companion cell plan after cells exist.

**Tech Stack:** Node 22, React 19, TypeScript, Zod, PostgreSQL (Supabase), Vitest, shadcn/ui.

## Global Constraints

- Single church; no V2/V3 or member-facing login.
- First and last name, email, compound, birth month/day and consent required for new registrations; phone, middle name, room, birth year and active department optional.
- Existing people with missing new data still read successfully. Do not leak fields in ordinary directory/scanner/report responses.
- Preserve QR card issuance, duplicate review and manual check-in. Do not send registration email.
- No secret values in code, logs or chat; apply migration before deploying API.

## File map

- `supabase/migrations/003_registration_details.sql`: nullable columns and one-current-department index.
- `scripts/migrate-registration.ts`: approved-project guard and transactional migration, patterned on `scripts/migrate-staff.ts`.
- `server/people.ts` + `server/people.test.ts`: validation, duplicate lookup and transaction.
- `server/catalogs.ts` + `server/catalogs.test.ts`: admin-managed compounds/departments and active choices.
- `server/app.ts` + `server/app.test.ts`: authorization and HTTP catalog/registration contracts.
- `src/features/cmams/desk.tsx` + `src/features/cmams/cmams.browser.test.tsx`: form/consent/validation.
- `src/features/cmams/types.ts`: typed catalog and registration data.

### Task 1: Registration validator and migration

**Interfaces:** `validateRegistration(input: unknown): Registration` where `Registration` includes `email: string`, `compoundId: string`, `birthMonth: number`, `birthDay: number`, `birthYear?: number`, `room?: string`, `departmentId?: string`; optional `phone: string | null`.

- [ ] Write failing `server/people.test.ts` cases using `validateRegistration({ firstName:'Ada', lastName:'Okafor', email:'ada@example.org', compoundId: uuid, birthMonth:2, birthDay:29, consent:true })` (valid) and supplied year 2025 (invalid), missing email/compound/month/day (invalid), and leap year 2024 (valid).
- [ ] Run `.\node_modules\.bin\vitest.cmd run --project server server/people.test.ts`; expect failures.
- [ ] Add Zod fields and calendar-day validation (yearless February 29 allowed). Write `003_registration_details.sql`: nullable `email`, `room`, `birth_year` (year range 1900..current checked server-side); add a partial unique index on `person_departments(person_id) WHERE valid_to IS NULL` only after a preflight query for multiple active rows. Make migration script guard the approved church project and abort rather than deleting historical assignments.
- [ ] Run focused tests and `tsc -p tsconfig.server.json`; commit validator/migration.

### Task 2: Catalogs and registration persistence

**Interfaces:** `listActiveCatalogs(db): Promise<{ compounds: {id:string;name:string}[]; departments: {id:string;name:string}[] }>`; `createCatalogEntry(db, kind:'compounds'|'departments', name:string)`; `deactivateCatalogEntry(db, kind, id)`; `registerPerson(db,input,staffId)` keeps its current response.

- [ ] Test unknown/inactive compound/department rejection, email duplicate as review only, transactional `people` insert plus `person_departments` insert, rollback and deactivation that retains existing member association.
- [ ] Run focused server tests; expect failure.
- [ ] Implement `server/catalogs.ts` with allowlisted table names, parameterized values, active-only lists, and Admin-only create/rename/deactivate routes in `server/app.ts`; add authenticated read-only catalog route for Registration Desk. Update duplicate endpoint to accept email and return existing masked candidate details only. Persist email normalized, room, month/day/year, compound and optional department inside registration transaction. Avoid selecting new private columns in general directory responses.
- [ ] Run focused server tests, typecheck, commit.

### Task 3: Registration form

**Interfaces:** GET `/api/v1/catalogs` returns active compounds/departments; POST `/api/v1/people` accepts fields in Task 1; POST `/api/v1/people/duplicates` additionally accepts email.

- [ ] Write browser test for required controls, optional year, submitted payload, validation and unchanged consent/card flow; run focused browser Vitest and expect failure.
- [ ] Add accessible email input, compound/department selectors, room input, month/day selectors and optional numeric year in `desk.tsx`; reset duplicate confirmation when identity fields change; update privacy copy; preserve form input after errors. Show catalog loading/error/empty states.
- [ ] Run browser test; run `.\node_modules\.bin\vitest.cmd run`, `pnpm build`, `.\node_modules\.bin\eslint.cmd .`, `.\node_modules\.bin\prettier.cmd --check .`; commit.

### Task 4: Release gate

- [ ] Check migrations against a disposable database first, confirm production project and preflight result; apply migration **before** deploying registration code, using the guarded migration script. Do not include credentials in output.
- [ ] Verify creation, duplicate handling and existing profile reads; deploy only after migration and tests. Record migration and deployment status in release notes.

Cell management and optional cell selection are planned separately in `2026-10-28-cell-groups.md`.
