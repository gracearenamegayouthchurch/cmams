# Google Calendar service drafts — CMAMS V1

## The idea in four steps

1. An Admin creates **Sunday Youth Service, 9:00 AM** on a dedicated, private church Google Calendar.
2. CMAMS reads that calendar automatically and shows **one draft**: “Sunday Youth Service — needs setup.” A draft is visible to staff who manage services, but it cannot be used for check-in.
3. An Admin or Service Supervisor opens the draft, chooses the service category, sets check-in opening and closing times, and clicks **Publish**.
4. The published service joins the existing Services list. At the allowed time, staff open check-in and registration desk staff scan cards as usual.

**No manual Import button is needed.** The existing “Schedule a service” form remains available when a service is not on Google Calendar.

## What sync means

- **Direction:** Google Calendar → CMAMS drafts. CMAMS does not create or change Google events.
- **Calendar:** One dedicated church calendar, not an Admin's personal calendar. Its contents stay private; a server-side Google service account is granted read-only access.
- **Refresh:** A protected external scheduler calls the CMAMS sync endpoint regularly. Opening Services also requests a refresh if the last one is stale. Aim for events to appear within one hour, subject to the scheduler and Google availability. Show the last successful sync time and an actionable error if sync fails.
- **Eligibility:** Import upcoming, timed events in a bounded window; skip all-day events and events without a usable start time. Recurring events appear as separate occurrences. Match by calendar, Google event/occurrence identity so retries do not produce duplicates.
- **Before publication:** Changes to a Google event update its draft. A deleted/cancelled Google event is removed or marked unavailable, never published automatically.
- **After publication:** CMAMS owns the check-in schedule. Google changes or cancellation flag the linked service for staff review; they do not silently change its time, delete attendance, or close check-in. This rule prevents a calendar edit from disrupting an active service.

## Permissions and safety

- Only Admins and Service Supervisors may review and publish Google drafts, matching the existing permission to schedule services. Other staff do not see unpublished drafts.
- Publishing requires a valid CMAMS category and a check-in close time later than its open time. It creates one real service, atomically links it to the draft, and is safe to retry.
- A draft is **not** a `SCHEDULED` service: it must not appear in the scanner's service picker, dashboard attendance totals, or reports until published.
- Keep Google credentials, calendar ID if sensitive, and scheduler secret on the server. Never put private keys in browser code, the repository, logs, or chat. The sync endpoint must authenticate its scheduler and avoid exposing calendar details publicly.
- Sync failures must leave existing published services usable; the manual CMAMS scheduling path must keep working.

## Implementation outline

1. Add a separate database table for Google event drafts, keyed by calendar and event occurrence, with source timestamps, sync/review state, and an optional linked CMAMS service ID. Do not add a draft value to the existing service status enum.
2. Add a server-only Google Calendar reader and an idempotent sync operation. Store server-side credentials in deployment secrets; use read-only Calendar API access.
3. Add a protected scheduled-sync endpoint and a rate-limited refresh from the Services page. Use an external scheduler rather than assuming Vercel Hobby supports hourly cron.
4. Add the draft review/publish UI to Services and retain the manual scheduling form. Show sync status and Google-change warnings.
5. Test duplicate syncs, recurring instances, edits, cancellation, failed Google requests, authorization, safe publication, and continued check-in behavior. Apply the database migration **before** deploying the new API.

## Setup needed from the church

- The dedicated church Google Calendar and permission to share it with a read-only service account.
- Google Cloud project/service-account credentials entered directly into the approved server-side secret store, **not sent through chat**.
- A configured external scheduler and its secret, also stored securely. Select and configure the scheduler during implementation; do not promise an exact one-hour guarantee until its delivery behavior is verified.

This feature is limited to scheduling services for this single church. It does not add member-facing invitations, email reminders, a public events calendar, or full two-way Google Calendar sync.
