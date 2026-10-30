# Member Registration Validation Design

## Problem

Submitting **Register person** can return a generic `400 {"error":"Invalid request"}`. The registration form accepts arbitrary optional phone text, while the server requires international E.164 (`+` and 8–15 digits). Invalid email, birthday, or catalog IDs can produce the same generic response. The rejected registration does not reach the database, so Supabase database logs cannot identify the failing field.

## Approach

Preserve the existing registration schema and database data. On `POST /api/v1/people` only, translate Zod validation failures into a safe, specific field message and a stable validation code; never include submitted values or raw exception details in a response or log. For malformed JSON, retain the generic `Invalid request` response. Keep unrelated endpoints' response behavior unchanged.

In the registration form, reject non-E.164 phone input before submitting with a helpful message (`+2348031234567` is an example). Blank phone remains valid, and the field is never automatically converted to avoid guessing a country code. Show the API's specific field message for other registration validation failures through the existing error display.

## Testing

Write failing API tests for invalid optional phone and another invalid registration field, verifying a 400 with a field-specific message and no submitted values. Test malformed JSON remains generic. Add a browser test that submits a plausible member with a local-format phone and checks that the form explains the format without posting the registration. Run focused server and browser tests, then build and run broader checks. Deploy only after those checks and verify the existing production URL; report unrelated baseline failures rather than modifying other work.

## Constraints

- Do not expose names, email addresses, phone numbers, tokens, or credentials in logs or test output.
- Do not alter Supabase data or migrations.
- Keep unrelated in-progress analytics files unchanged.
