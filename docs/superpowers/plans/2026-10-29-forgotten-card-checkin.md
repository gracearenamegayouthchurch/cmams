# Forgotten-Card Check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let staff check in registered members by name or phone when they forgot their QR card, on both the Check-in and Registration desk pages.

**Architecture:** Reuse the authorized paginated people lookup and the existing audited manual check-in API. Normalize phone input server-side and add a small, self-contained search/selection form to Scan; retain the existing Desk check-in panel. Neither phone alone nor a failed request is a successful check-in.

**Tech Stack:** TypeScript, React, TanStack Query, PostgreSQL, Vitest browser/server, Vercel.

## Global Constraints

- Keep `https://gamyc.vercel.app` and its existing Vercel project; no secrets in code or chat and no subagents.
- Do not grant unauthenticated or member login access: this is staff-assisted service attendance.
- Each phone may belong to multiple people; explicitly select a person and enter a reason (3–500 characters).
- Do not expose raw phone numbers in directory responses; preserve current RBAC, one-check-in-per-person-per-service, and existing QR/shortcode behavior.
- No new database migration is needed.

## File Map

- `server/people.ts`, `server/people.test.ts`: normalize phone queries and cover both paginated result/count queries and masking.
- `src/features/cmams/scan.tsx`: Scan page fallback lookup, explicit selection and manual check-in feedback.
- `src/features/cmams/desk.tsx`: update existing-member search hint to include phone.
- `src/features/cmams/cmams.browser.test.tsx`: check-in fallback and desk phone UI tests.
- `README.md`: mention staff-assisted forgotten-card check-in.

---

### Task 1: Make directory lookup search phone numbers

**Files:** Modify `server/people.ts:230-295`; test `server/people.test.ts`.

**Interfaces:** `listPeoplePaginated(db, role, search, options)` remains unchanged. Its returned `people` retain masked `phone` only.

- [x] **Step 1: Write failing server tests.** Add tests exercising a query spy for both list and empty-page count. Assert both SQL statements include a parameterized phone predicate, the query parameters use the same normalized phone value, `0803 123-4592` becomes `+2348031234592`, `+2348031234592` stays unchanged, and an alphabetic name has no phone match. Assert results include multiple rows with a shared phone and never `phone_e164`.
- [x] **Step 2: Run tests to verify red.** `npx vitest run --project server server/people.test.ts` (expected new tests fail).
- [x] **Step 3: Implement minimal server change.** Derive `const phoneSearch = /^\+?[\d\s()-]+$/.test(search.trim()) ? search.replace(/\D/g, '').replace(/^0(?=\d{10}$)/, '234') : ''`; only use it if it is long enough to avoid broad matches (at least 7 digits). Add `OR ($5 <> '' AND regexp_replace(coalesce(p.phone_e164, ''), '\\D', '', 'g') LIKE '%' || $5 || '%')` to the paginated SELECT predicate, and the same expression with `$3` in the count query; pass phoneSearch as the fifth or third bound parameter respectively. Preserve name/code predicates, caps and masking. For local `0…` input normalize to `234…` only for 11-digit Nigerian numbers. Use parameterized SQL, never interpolate the search string.
- [x] **Step 4: Run tests to verify green.** `npx vitest run --project server server/people.test.ts`.
- [x] **Step 5: Commit.** `git add server/people.ts server/people.test.ts && git commit -m "Search directory by phone for staff check-in"`.

### Task 2: Registration desk recognizes phone search

**Files:** Modify `src/features/cmams/desk.tsx:730-775`; test `src/features/cmams/cmams.browser.test.tsx`.

**Interfaces:** Existing `memberResults` still requests `/api/v1/people?q=<encoded>&page=1&pageSize=10` and uses the current manual-check-in endpoint. The search input label becomes `Search members by name, phone or code`.

- [x] **Step 1: Add a browser test.** Render `DeskPage`, switch to Existing member, type `0803 123 4592`, assert `fetch` was called with the encoded phone query, render two matching profiles to ensure selecting one doesn't auto-check-in, and assert the existing selected-person reason field remains required before check-in.
- [x] **Step 2: Run red.** `npx vitest run src/features/cmams/cmams.browser.test.tsx`.
- [x] **Step 3: Update hint and label.** Replace the existing name/code-only label/placeholder/instruction with `Search members by name, phone or code` and a matching placeholder; leave search and manual-check-in mechanics intact.
- [x] **Step 4: Run green.** `npx vitest run src/features/cmams/cmams.browser.test.tsx`.
- [x] **Step 5: Commit.** `git add src/features/cmams/desk.tsx src/features/cmams/cmams.browser.test.tsx && git commit -m "Expose phone lookup at registration desk"`.

### Task 3: Add explicit fallback to Scan

**Files:** Modify `src/features/cmams/scan.tsx:1-454`; test `src/features/cmams/cmams.browser.test.tsx`.

**Interfaces:** Query `GET /api/v1/people?q=<encoded>&page=1&pageSize=10` for nonempty debounced input using `useDebouncedValue`; submit `POST /api/v1/services/${activeId}/manual-check-ins` with `{ personId: selected.id, eventId: crypto.randomUUID(), reason: reason.trim() }`. Reuse `Person`, `PaginatedPeople` from `types.ts` and `ServicePicker` already on Scan.

- [x] **Step 1: Write failing browser tests.** With one open service and two people sharing a phone, search `0803 123 4592`, select Ada explicitly, enter `Forgot QR card`, submit, and assert the request body has Ada's ID, selected service ID, and reason. Assert the result reports success only for `CHECKED_IN`, duplicate for `ALREADY_CHECKED_IN`, and error for a rejected fetch. Check input without an open service or fewer than three reason characters disables submission; changing the query clears selection.
- [x] **Step 2: Run red.** `npx vitest run src/features/cmams/cmams.browser.test.tsx`.
- [x] **Step 3: Implement.** Add a `Forgot QR card? Search by name or phone` card below the scan card, with a debounced, enabled-only-when-nonempty query, loading/empty/error states, selectable name/code/masked-phone results, and reason input. On submit set `busy` and clear stale status; call manual endpoint, map the outcome into the existing `status` UI (include selected person's name/code), never mark an unsuccessful response `CHECKED_IN`, and on failure show a network error. Avoid putting raw search phone values in recent scans. Keep the QR scan and shortcode controls untouched.
- [x] **Step 4: Run green.** `npx vitest run src/features/cmams/cmams.browser.test.tsx`.
- [x] **Step 5: Commit.** `git add src/features/cmams/scan.tsx src/features/cmams/cmams.browser.test.tsx && git commit -m "Check in forgotten-card members by name or phone"`.

### Task 4: Verify and ship

**Files:** Modify `README.md:19-24` to note Scan and Desk fallback.

- [x] **Step 1: Verify.** Run `npm test`, `npm run lint`, `npm run build`, and `git diff --check`; resolve failures before proceeding.
- [x] **Step 2: Commit and push.** Commit README, push `feature/compound-regions` to origin (do not modify main).
- [x] **Step 3: Deploy.** Set `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` from the already-linked `C:\Users\MAFUYAI\Documents\cmams-v1\.vercel\project.json` without printing them; run `npx vercel deploy --prod --yes --no-color` in this worktree. Do not expose `.env.local`.
- [x] **Step 4: Verify live.** Check `/` and `/scan` return 200; unauthenticated `/api/v1/people?q=0803` and manual check-in remain 401. Verify the new Scan bundle includes fallback copy. An authenticated check-in requires user credentials and should not be simulated in production.
