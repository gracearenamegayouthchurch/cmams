# Scheduled service edit and cancellation

## Behavior

Admins and Service Supervisors may edit the name, category, scheduled start, and check-in window of a `SCHEDULED` service. Reuse the service-create validation (name length, allowed category, ISO timestamps, close after open). Once check-in opens or closes, the service and its attendance history become immutable through edit/cancel actions.

On the Services page, **Edit** opens a prefilled form for a scheduled service; saving displays confirmation and refreshes the list. **Delete** opens a confirmation that explains the action is cancellation, not removal of records. Confirming marks an eligible scheduled service `CANCELLED` and removes it from the default list. No hard DELETE is exposed. A canceled service cannot be reopened, edited, or canceled again. Neither operation is allowed when any attendance records reference the service, even in an unexpected scheduled state. Return a 409 with a safe error code for a missing or ineligible service, a 400 for invalid edit data, and 403 for insufficient permissions. Existing open/close flows remain unchanged.

## Backend and safety

Add `PATCH /api/v1/services/:id` and `POST /api/v1/services/:id/cancel` using the existing `services` RBAC capability and a validated UUID. Use conditional SQL updates guarded by `status='SCHEDULED'` and absence of attendance records; no migration is needed because `CANCELLED` already exists and `listServices` excludes it. Record actor and service ID in append-only audit logs inside the same transaction, avoiding private member details. Prefer a clear named `ServiceTransitionError` for ineligible changes.

## Testing and rollout

Write server tests for editable scheduled services, invalid times, role denial, open/closed/canceled or attended service protection, audit and rollback; browser tests for edit prefill/save and cancel confirmation/hide on the Services page. Run the full test suite, build and focused lint, then deploy. If performing a live check, use a newly created synthetic Service Supervisor account and a uniquely named synthetic service; edit and cancel only that service and deactivate the account immediately. The previously disabled synthetic Pastor account remains inactive. Never log credentials, generated passwords, real member records or tokens.
