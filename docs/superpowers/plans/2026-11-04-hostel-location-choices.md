# Hostel Location Choices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identify boys' and girls' hostels explicitly in member compounds and cell meeting locations.

**Architecture:** Shared pure hostel options/validation in `server/hostel-locations.ts`; both frontend forms and backend writes consume the module. Keep existing text columns and region codes; persist complete category/building names.

**Tech Stack:** TypeScript, Zod, React, Vitest, PostgreSQL.

## Global Constraints

- Boys Hostel: Chalet only. Girls Hostel: New Tetfund, Tetfund, Chalet. Needs Assessment excluded.
- No gender field, no automatic migration of legacy strings, and non-hostel behavior stays unchanged.
- Do not deploy or alter production data as part of this implementation.

---

### Task 1: Shared options and server validation

**Files:** Create `server/hostel-locations.ts`, `server/hostel-locations.test.ts`; modify `server/people.ts`, `server/app.ts`, `server/cells.ts` and their tests.

**Interfaces:** Export `HOSTEL_BUILDINGS`, `hostelName(category, building)`, `parseHostelName(value)`, `isValidHostelName(value)`. `parseHostelName` returns `{ category, building } | null`; backend validates only when region is `HOSTEL`.

- [ ] Add failing tests for all four allowed names, forbidden combinations, invalid hostel registration and cell create/edit/location; verify non-hostel free text remains valid.
- [ ] Run targeted server tests; confirm failures.
- [ ] Add shared options and input validation in registration, profile API and cell create/edit/leader update. For leader updates query locked cell region before checking location.
- [ ] Run targeted server tests and commit.

### Task 2: Frontend selectors

**Files:** Create `src/features/cmams/hostel-location-fields.tsx`; modify `src/features/cmams/desk.tsx`, `src/features/cmams/complete-profile.tsx`, `src/features/cmams/cells.tsx`, browser tests.

**Interfaces:** `HostelLocationFields({value, onChange, prefix})` renders category and building selects; `onChange` receives a full name or `''` on category reset. For Hostel, replace free-text fields in registration, profile completion, and cell creation/edit/leader location; other regions keep existing controls.

- [ ] Add browser tests for boys/girls option filtering and reset on category/region changes.
- [ ] Run browser tests; confirm failure.
- [ ] Implement selectors with shared options and integrate them at all locations.
- [ ] Run browser tests and commit.

### Task 3: Verify

**Files:** No additional application files unless failures require focused fixes.

- [ ] Run `npm test -- --run`, `npm run build`, and `npm run lint`; identify pre-existing lint issues separately.
- [ ] Verify no database migration, no production changes, and clean status; report results.
