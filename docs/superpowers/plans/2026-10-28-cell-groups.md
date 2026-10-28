# Cell Groups and Saturday Meetings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This project owner requested **no subagents**; execute inline.

**Goal:** Let Admins/Pastors manage cells and one leader per cell, while leaders can view their own members and record/analyze Saturday cell attendance only.

**Architecture:** Separate cell membership, meetings, and attendance tables from church services. Introduce server-enforced cell-scoped endpoints and screens; use existing card credential resolution with dedicated attendance persistence. Release cell picker in registration only after catalog and assignments exist.

**Tech Stack:** Node 22, React 19, TypeScript, PostgreSQL (Supabase), Vitest, shadcn/ui.

## Global Constraints

- One church; one active cell per member and one active cell per leader; one active leader per cell.
- Admin/Pastor manage groups and assignments; leader schedules/opens/scans only own cell. Leader sees full current member profile but never church-service attendance or global directory.
- Archive cells, never destroy historical attendance. Saturday meetings only; church-service reports/scan unchanged.
- RLS enabled, server-only DB access and validated access per request; migrate before deploying code or adding leaders; no secrets in chat.

## File map

- `supabase/migrations/004_cell_groups.sql`: `CELL_LEADER` enum value, cells, current/history member and leader assignments, cell meetings and cell attendance with unique/FK constraints and RLS.
- `scripts/migrate-cells.ts`: guarded church-project migration.
- `server/cells.ts` + `server/cells.test.ts`: group/assignment/archive transactions and scoped reads.
- `server/cell-meetings.ts` + `server/cell-meetings.test.ts`: time windows, transitions, scan idempotency, aggregates.
- `server/app.ts` + `server/app.test.ts`: cell-specific routes and authorization checks.
- `server/rbac.ts`, `server/staff.ts`, `server/auth.ts` + tests: role creation and persisted assignment checks.
- `src/features/cmams/cells.tsx`, `src/features/cmams/cell-meetings.tsx` + browser tests: management, leader view and scan.
- `src/features/cmams/desk.tsx`, `src/features/cmams/access.ts`, `src/features/cmams/types.ts`, `src/lib/cmams-api.ts`, routes/sidebar and tests: optional cell selector and navigation.

### Task 1: Schema and role

**Interfaces:** `CELL_LEADER` is an allowed `StaffRole`; database tables provide cell ID, current assignment and immutable meeting attendance.

- [ ] Add tests ensuring `allow('CELL_LEADER','services')` and `allow('CELL_LEADER','export')` are false; test role round-trip in staff creation and sessions.
- [ ] Run `.\node_modules\.bin\vitest.cmd run --project server`; expect failure.
- [ ] Create `004_cell_groups.sql`: role enum, named active cells with location, assignment history with partial unique indexes on current member and leader assignments, Saturday meeting timestamps/status, unique `(meeting_id,person_id)` attendance and RLS. Guard migration against wrong database. Update role/session validation while preserving password rotation and session invalidation.
- [ ] Run focused tests, typecheck and commit.

### Task 2: Group management and scoping

**Interfaces:** `createCell(db,{name,location},actorId)`, `archiveCell(db,id,actorId)`, `assignMember(db,cellId,personId,actorId)`, `assignLeader(db,cellId,staffId,actorId)`, `listCellMembers(db,staffId,role,cellId)`; unauthorized cell access returns 403 without member details.

- [ ] Test admin/pastor-only group mutation, leader scope, concurrent moves, archived cells, leader replacement and immediate revocation.
- [ ] Run focused tests; expect failure.
- [ ] Implement transactional assignments, audited management and select-by-current-staff-id scoping in `server/cells.ts`; add explicit cell API routes before existing fallback in `server/app.ts`. Do not reuse global member-history query for leaders; return explicitly chosen full profile fields only for current same-cell members.
- [ ] Run server tests and commit.

### Task 3: Separate Saturday attendance

**Interfaces:** `createCellMeeting(db,cellId,{start,opens,closes},actor)`, `transitionCellMeeting(db,meetingId,action,actor)`, `scanCellCard(db,meetingId,credential,eventId,actor)`, `cellSummary(db,cellId,actor)`; all check cell authorization server-side.

- [ ] Test Saturday validation in `Africa/Lagos`, open/close window, active credential and current membership, idempotent repeated scans, denied cross-cell requests, no church-service attendance fields in leader responses, and historical rows after move/archive.
- [ ] Run focused tests; expect failure.
- [ ] Implement meeting lifecycle/attendance in `server/cell-meetings.ts` and cell-only routes in `server/app.ts`; use existing hashed credential lookup, write **only** to cell attendance, avoid identifying out-of-cell people in error responses.
- [ ] Run focused/full server tests and commit.

### Task 4: Screens and registration cell picker

**Interfaces:** GET `/api/v1/cells` active groups for Admin/Pastor/registration; Cell Leader endpoints return only assigned cell; registration POST accepts optional `cellId` after Task 2.

- [ ] Write browser tests for Admin/Pastor managing cells, leader member detail isolation, leader Saturday scanning, optional cell choice at registration and absence of global service history/analytics.
- [ ] Run browser test; expect failure.
- [ ] Build `cells.tsx` and `cell-meetings.tsx` scoped UI; add leader route/sidebar, and cell selector to `desk.tsx` using active catalog. Extend server registration transaction to write optional membership under the same assignment rules. Never expose `/scan`, `/reports` or global `/members` to Cell Leader.
- [ ] Run `.\node_modules\.bin\vitest.cmd run`, `pnpm build`, ESLint and Prettier; commit.

### Task 5: Release gate

- [ ] Verify migration on disposable DB then approved church project (abort on unexpected existing data). Apply before deploying cell APIs and before issuing `CELL_LEADER` accounts.
- [ ] Exercise real role-based smoke checks: leader cannot fetch a different cell or service attendance; archived leader immediately loses access; original check-in still works. Deploy and record status only when all checks pass.
