# CMAMS Review Fixes Implementation Plan

> **For agentic workers:** Inline execution only; the user explicitly requested no subagents. Steps use test-first verification.

**Goal:** Resolve confirmed V1 privacy, scanner, pagination, history and search issues without touching production services.

**Architecture:** Keep existing `/api/v1` contracts and React pages. Database queries own accurate counts; the scanner lock handles retry semantics while the page serializes check-ins. Use a small shared React debounce hook for directory and card searches.

**Tech Stack:** TypeScript, React, TanStack Query, PostgreSQL, Vitest Node and browser tests.

## Global Constraints

- Mask phone on ordinary directory and history results; leave authorized audited exports untouched.
- No offline check-in and no successful result for network failures.
- No database migration, deployment, or credential exposure.

---

### Task 1: Privacy and accurate directory totals

**Files:** `server/people.ts`, `server/people.test.ts`, `server/app.test.ts`, `src/features/cmams/directory.tsx`.

- [x] Add failing tests for masking across roles, total count on an empty page, and full attendance count after a 100-record history cap.
- [x] Run focused server tests; confirm failures represent missing behavior.
- [x] Mask all ordinary profile phone numbers; query count only on empty page; include actual attendance count in the person detail and display that count.
- [x] Run focused server tests and confirm green.

### Task 2: Scanner retry and keyboard wedge

**Files:** `src/features/cmams/scan.tsx`, `src/features/cmams/scan-lock.ts`, `src/features/cmams/scan-lock.test.ts`, `src/features/cmams/cmams.browser.test.tsx`.

- [x] Add failing tests for a seven-character wedge shortcode, immediate retry after request failure, and blocking overlapping scans.
- [x] Run focused tests and confirm red.
- [x] Add a lock release on failure; guard in-flight submissions synchronously; recognize only supported card payloads on keyboard-wedge Enter.
- [x] Run focused tests and confirm green.

### Task 3: Search request pacing

**Files:** `src/features/cmams/directory.tsx`, `src/features/cmams/cards.tsx`, `src/features/cmams/use-debounced-value.ts`, `src/features/cmams/cmams.browser.test.tsx`.

- [x] Add a browser regression test showing a burst of typing produces one settled member-search request, and a second test preventing stale card issue results.
- [x] Run the focused browser tests and confirm red.
- [x] Debounce directory and card search query keys and requests by 300 ms while keeping input responsive; hide stale actionable results.
- [x] Run browser tests and confirm green.

### Task 4: Final verification

- [x] Run `pnpm test`, `pnpm build`, `pnpm lint`, and `pnpm format:check`.
- [x] Inspect `git diff` and working-tree status; report results and any outstanding limitations. Do not deploy.
