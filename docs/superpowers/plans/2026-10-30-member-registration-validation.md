# Member Registration Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic 400 on invalid member registration with a safe field-specific message, and prevent invalid phone submissions at the registration desk.

**Architecture:** Keep `server/people.ts` as the validation authority. At the `POST /api/v1/people` boundary in `server/app.ts`, map only Zod issue *paths* to safe messages; never echo rejected values. In `src/features/cmams/desk.tsx`, check optional phone format before making the registration request, without changing its stored representation.

**Tech Stack:** TypeScript, Zod, React, Vitest server/browser, Vercel.

## Global Constraints

- Do not expose names, email addresses, phone numbers, tokens, or credentials in logs or test output.
- Do not alter Supabase data or migrations.
- Keep unrelated in-progress analytics files unchanged.
- Deploy only after tests and build; keep `https://gamyc.vercel.app` and the existing Vercel project.

---

### Task 1: API validation errors

**Files:**
- Modify: `server/app.test.ts` (registration route tests)
- Modify: `server/app.ts` (exception boundary)

**Interfaces:** Consumes `registerPerson` and `z.ZodError`; produces `{ error: string, code: 'REGISTRATION_VALIDATION_ERROR' }` on invalid registration and unchanged generic 400 for malformed JSON.

- [ ] **Step 1: Write failing tests** for phone, invalid email, birthday, and malformed JSON at the authenticated registration endpoint. Use synthetic values and a mocked staff lookup; assert status 400, safe field messages, and no echo of submitted values. For example:

```ts
const response = await handleApi(new Request('https://church.example/api/v1/people', {
  method: 'POST',
  headers: { origin: 'https://church.example', 'content-type': 'application/json', cookie: `cmams_session=${token}` },
  body: JSON.stringify({ ...validRegistration, phone: '08031234567' }),
}))
expect(response.status).toBe(400)
expect(await response.json()).toMatchObject({ code: 'REGISTRATION_VALIDATION_ERROR', error: expect.stringMatching(/phone/i) })
```

- [ ] **Step 2: Run** `npx vitest run --project server server/app.test.ts -t "registration validation"`; confirm it fails on generic `Invalid request`.
- [ ] **Step 3: Implement** a fixed allowlist of field-to-message strings at the registration Zod catch branch, selecting `error.issues[0]?.path[0]` only; fallback `Invalid request` for unrecognized paths and SyntaxError. Never serialize `error.issues` or submitted values.

```ts
if (error instanceof z.ZodError && path === '/api/v1/people' && method === 'POST') {
  const field = String(error.issues[0]?.path[0] ?? '')
  return json({ error: registrationFieldMessages[field] ?? 'Invalid request', code: 'REGISTRATION_VALIDATION_ERROR' }, 400)
}
```

- [ ] **Step 4: Rerun** the focused API tests; commit only `server/app.ts` and `server/app.test.ts`.

### Task 2: Phone guidance in the form

**Files:**
- Modify: `src/features/cmams/cmams.browser.test.tsx` (registration workflow)
- Modify: `src/features/cmams/desk.tsx` (submit guard)

**Interfaces:** Consumes the existing optional phone value; preserves `null` for blank and unmodified E.164 for valid values. Rejects other nonblank phone input with a human-readable message before calling `POST /api/v1/people`.

- [ ] **Step 1: Write a failing browser test** that fills a synthetic registration with a local-format phone, submits, and asserts a phone-format message and no registration POST. Use the existing DeskPage rendering helper and catalog fixtures; do not assert on a mocked response.

```ts
await userEvent.type(screen.getByLabelText(/phone number/i), '08031234567')
await userEvent.click(screen.getByRole('button', { name: 'Register person' }))
await expect.element(screen.getByRole('alert')).toHaveTextContent(/phone.*country code/i)
expect(registrationPosts).toBe(0)
```

- [ ] **Step 2: Run** `npx vitest run --project browser src/features/cmams/cmams.browser.test.tsx -t "phone format"`; confirm failure on the missing guard.
- [ ] **Step 3: Implement** a submit-time check for `phone.trim()` against `/^\+[1-9]\d{7,14}$/`, retaining the original value for valid input and leaving the optional empty value as `null`. Show the format example and return without POST when invalid.

```ts
if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) {
  setError('Enter a phone number with country code and no spaces (e.g. +2348031234567), or leave it blank.')
  return
}
```

- [ ] **Step 4: Rerun** the focused browser test; commit only `desk.tsx` and its test.

### Task 3: Verification and production deployment

**Files:** No source changes; project already linked through `.vercel/project.json` in the main checkout.

- [ ] **Step 1: Run** `npm run test:server`, focused browser tests, `npm run build`, `npm run lint`, `git diff --check`, and Prettier checks for touched files. Run `npm test` where feasible, and report unrelated failures accurately.
- [ ] **Step 2: Ensure** only task commits are deployed; preserve uncommitted analytics files. Push the task commits to the intended branch without staging other work.
- [ ] **Step 3: Deploy** with `npx vercel deploy --prod --yes` from the linked main checkout; confirm the production build and alias `https://gamyc.vercel.app`.
- [ ] **Step 4: Verify** live `/desk` returns 200 and unauthenticated `POST /api/v1/people` rejects access, without using real member details or creating records.
