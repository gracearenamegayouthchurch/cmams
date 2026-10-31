# Staff audit parameter type fix

## Problem and scope

An authenticated production `POST /api/v1/staff` with synthetic input returns HTTP 503. Its server log reports PostgreSQL error 42P18, `could not determine data type of parameter $3`. A read-only PostgreSQL probe proves that `jsonb_build_object('role',$N)` with an untyped bound value fails; explicitly typing `$N::text` succeeds. The creation query's audit write uses this expression; staff role changes use the same pattern for role and boolean values.

## Fix

Keep staff creation, permissions, and audit payloads unchanged. In `server/staff.ts`, cast bound role values to `text` and bound active-state values to `boolean` inside the two staff audit `jsonb_build_object` calls. Do not change the insert into `staff_users`, password handling, error codes, or unrelated audit paths.

## Verification

Add focused regression assertions for both audit SQL bindings, then run the server and full test suites, build, and changed-file lint. Push and deploy the isolated commit without staging unrelated analytics or generated route edits. Retry live staff creation with a unique synthetic account, never print its temporary password, and immediately deactivate it. If the live request still fails, inspect the sanitized production error before attempting another change.
