# Forgotten-card check-in by name or phone

## Goal

Give authorized staff a way to check in a registered person who forgot their QR card or shortcode. This is **staff-assisted service attendance**, not member authentication or a substitute staff login.

## Flow

- On both **Check-in (Scan)** and **Registration desk → Existing member**, staff can search by name or phone number (and retain member-code search).
- The search returns matching profiles, including multiple people sharing a phone. Staff must explicitly select the correct person; a phone match alone never records attendance. Show the name, member code, and the existing role-appropriate masked phone data for disambiguation.
- Staff choose an open service and enter a reason (at least three characters, e.g. “Forgot QR card”), then submit through the existing `/api/v1/services/:id/manual-check-ins` API with a fresh event ID.
- Show the existing success, already-checked-in, and failure/closed-service outcomes without reporting an offline request as successful. Disable submission while pending; no open service means no check-in.
- QR scanning and shortcode entry remain unchanged. No profile edits or member self-service access are added.

## Implementation boundaries

- Extend the authorized, paginated `/api/v1/people?q=` directory lookup to match a normalized phone query as well as name/code, using a parameterized query in both the result and count paths. Accept a local Nigerian `0…` phone input as equivalent to a stored `+234…` number, and tolerate spaces/hyphens in the query. Do not expose raw phone numbers or broaden route permissions.
- Reuse the existing directory search and manual-check-in API on the Scan page; retain the Registration desk's existing-member selection and reason panel, updating its search wording. Keep search results bounded/debounced and don't show unfiltered profiles before typing.
- Preserve existing database idempotency and attendance promotion logic: one attendance record per person per service, regardless of lookup method.

## Verification

- Server tests: name/code search still works, phone search supports international and local Nigerian formatting, shared phones yield multiple results, pagination count matches the filtered results, and returned phone numbers stay masked.
- Browser tests: searching/selecting a person and submitting a reason on the Scan page calls manual check-in for the selected ID and service; Registration desk searches by phone; duplicate and failed requests cannot appear as successful check-ins.
- Run tests, lint, and production build. Ship the API and UI to the existing Vercel project; verify the live routes and unauthenticated API behavior without using staff credentials in chat.
