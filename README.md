# Grace Arena · CMAMS V1

Single-church online Member and Attendance Management System for **Grace Arena Mega Youth Church**, built around one continuous profile per person, opaque QR credentials, atomic service check-ins, and audited pastoral reporting.

## Architecture & Scope

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui, TanStack Router & Query — adapted from [`satnaing/shadcn-admin`](https://github.com/satnaing/shadcn-admin) under the [MIT License](./LICENSE).
- **API:** Serverless Node/TypeScript `/api/v1/*` handlers (`api/index.ts` → `server/app.ts`) hosted on Vercel (and mounted via Vite middleware in local `pnpm dev`).
- **Database:** Supabase PostgreSQL (`supabase/migrations/001_cmams.sql`) accessed exclusively from the server; RLS is enabled on every table with zero direct browser policies.
- **Single-church V1:** No campuses table, campus identifiers, or campus filters. Offline queueing/reconciliation (V3) and member self-service portals (V2) are intentionally excluded; network failures are never reported as successful check-ins.
- **Deployment hardening:** Node 22 runtime, no native image/PDF dependencies, strict security headers and CSP in `vercel.json`, and server-only database access.

## Operational Routes

| Route        | Purpose                                                                                                                    | Permitted Roles                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `/login`     | Staff session sign-in (`HttpOnly`, `SameSite=Strict`, `Secure` on HTTPS)                                                   | All staff                                                           |
| `/dashboard` | Live polled service summary, stage breakdown, and eligible member turnout                                                  | `SERVICE_SUPERVISOR`, `ADMIN`, `PASTOR_VIEWER`                      |
| `/scan`      | Camera QR scanner (`@zxing/browser`), USB keyboard wedge, and Crockford shortcode entry with 3s cooldown                   | `USHER_SCANNER`, `REGISTRATION_DESK`, `SERVICE_SUPERVISOR`, `ADMIN` |
| `/desk`      | Consent-first registration, `pg_trgm` swapped-name & shared-phone duplicate review, initial card issuance, manual check-in | `REGISTRATION_DESK`, `SERVICE_SUPERVISOR`, `ADMIN`                  |
| `/directory` | Single-church directory with role-based phone masking                                                                      | `REGISTRATION_DESK`, `SERVICE_SUPERVISOR`, `ADMIN`, `PASTOR_VIEWER` |
| `/services`  | Schedule gatherings, open check-in windows, close & freeze eligible member count                                           | `SERVICE_SUPERVISOR`, `ADMIN`                                       |
| `/cards`     | Supervised active-card lookup, revocation, and atomic replacement (browser-rendered PNG + printable PDF)                   | `SERVICE_SUPERVISOR`, `ADMIN`                                       |
| `/reports`   | Audited attendance CSV export and 3-Sunday consecutive absentee pastoral list                                              | `ADMIN`, `PASTOR_VIEWER`                                            |

## Local Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Copy `.env.example` to `.env.local` (git-ignored) and set server secrets — **never** prefix secrets with `VITE_`:
   ```ini
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.dyngikqhjxqprjhvrscz.supabase.co:5432/postgres
   SESSION_SECRET=at-least-32-cryptographically-random-characters
   ```
3. Apply the schema once to the empty church Supabase project (`dyngikqhjxqprjhvrscz`):
   ```bash
   pnpm migrate:church -- --confirm-project=dyngikqhjxqprjhvrscz
   ```
   The migration script verifies that `DATABASE_URL` points to `dyngikqhjxqprjhvrscz` and aborts if `people` or `staff_users` already exist.
4. Create the first administrator interactively (password input is hidden and never committed):
   ```bash
   pnpm bootstrap-admin admin@example.com "Full Name"
   ```
5. Start the local server (Vite frontend + `/api/v1/*` middleware):
   ```bash
   pnpm dev
   ```

### Staff management upgrade

**Before deploying the Staff page/API**, apply `supabase/migrations/002_staff_management.sql` to the approved church database:

```bash
pnpm migrate:staff -- --confirm-project=dyngikqhjxqprjhvrscz
```

The script refuses other database targets and existing/partial installations. This migration adds session-version and temporary-password-change fields without changing existing account passwords. On **Staff** (Admin only), create accounts with one of the five roles, manage access and reset passwords. The generated temporary password is displayed once: pass it to the intended staff member over a secure channel, not in chat, email, screenshots or logs. They must change it on first sign-in. Role/status/password changes invalidate existing sessions; the last active administrator cannot be disabled or demoted. All account mutations are audited. Staff can update their own password from the header.

## Verification & Scripts

- `pnpm test:server` — Node unit and API boundary suite (auth, RBAC, CSRF/origin validation, phone masking, duplicate matching, card SHA-256 hashing and collision-safe issuance, atomic check-in outcomes, CSV formula escaping, and Vercel/Vite URL adapters).
- `pnpm build` — TypeScript (`tsconfig.json` + `tsconfig.server.json`) and Vite production bundle.
- `pnpm lint` — ESLint across frontend, server, API, and scripts.
- `pnpm format:check` — Prettier formatting check.
- `CMAMS_TEST_DATABASE_ISOLATED=yes CMAMS_TEST_DATABASE_URL=... pnpm test:server` — Opt-in PostgreSQL constraint integration test against a separate disposable database (refuses to run against `dyngikqhjxqprjhvrscz`).
- `pnpm load:local` — Local-only 50-concurrent-scan contention smoke test (`scripts/load-checkins.ts`; refuses non-localhost URLs).
- `pnpm test` — Vitest browser suite using the installed Chrome channel by default. Set `CI=1` with Playwright Chromium installed via `pnpm test:browser:install` for CI runners.

### Current Verification Status

- **Verified locally:** `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm test:server` (Node unit & API boundary suite), and `pnpm test` (installed Chrome browser workflow tests across login, registration desk consent/duplicates, mobile shortcode scanning/network failure states, dashboard/access-denied states, and browser-rendered card downloads) all pass.
- **Applied to the church database:** `pnpm migrate:church -- --confirm-project=dyngikqhjxqprjhvrscz` applied the V1 schema on 2026-10-27. The first administrator was created with `pnpm bootstrap-admin`; `staff_users` contains one active `ADMIN` row with a valid password hash.
- **Deployed live:** `https://gamyc.vercel.app` serves the V1 build from the recreated `gracearenamegayouthchurch/cmams` repository. `/login` and `/dashboard` return `200`; `/api/v1/session` returns `401` without a cookie; a bad-credential login returns `401` from the live database; `/api/v1/logout` returns `200`.
- **Pending live verification:**
  - Administrator sign-in at `https://gamyc.vercel.app/login` with the real credentials (cannot be automated without the password).
  - GitHub user `trimwet` must accept the pending `write` collaborator invitation.
  - Vercel Git auto-deploy requires the Vercel GitHub App to be granted access to the recreated repository; until then, deploy with `vercel --prod --scope gamyc`.
  - `server/database.integration.test.ts` requires a disposable test DB (it refuses the church project).
  - Local concurrent load test (`pnpm load:local`) requires a running local database with an open test service.

## Production Cutover (`gracearenamegayouthchurch/cmams` → `https://gamyc.vercel.app/`)

1. Authenticate Vercel CLI (`vercel login`) under the account owning the existing project aliased to `https://gamyc.vercel.app/` — **do not delete the Vercel project**.
2. Set `DATABASE_URL` and `SESSION_SECRET` in Vercel Production/Preview environment variables, run `pnpm migrate:church -- --confirm-project=dyngikqhjxqprjhvrscz`, and run `pnpm bootstrap-admin`.
3. Record the existing GitHub repo settings, replace **only** `gracearenamegayouthchurch/cmams`, push `main`, and invite GitHub user `trimwet` as collaborator.
4. Reconnect the existing Vercel project's Git integration to the recreated `gracearenamegayouthchurch/cmams` repository (grant the Vercel GitHub App access to the new repository under GitHub Settings → Applications, then run `vercel git connect https://github.com/gracearenamegayouthchurch/cmams.git --scope gamyc`) and verify `https://gamyc.vercel.app/login` end-to-end.

## Attribution & License

UI layout and base components adapted from [`satnaing/shadcn-admin`](https://github.com/satnaing/shadcn-admin) by [@satnaing](https://github.com/satnaing), licensed under the [MIT License](./LICENSE).
