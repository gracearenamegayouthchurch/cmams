# Cell groups without preassigned locations and service creation verification

## Goal

Add exactly two active cell groups, **Across Region 9** (region `ACROSS`) and **Ndar Region 8** (region `NDAR`), without inventing meeting locations. Allow an admin or pastor to set a location later, and allow a cell leader to set the location of only their currently assigned active cell. Verify service creation without creating an unwanted live service. Existing cell groups, assignments, and church-service check-ins remain unchanged.

## Cell data and rollout

- Add a database migration after `009_staff_person_link.sql` to make `cells.meeting_location` nullable and insert the two named cells with `NULL` locations. Use `ON CONFLICT (name) DO NOTHING` so running the migration cannot overwrite an existing group, its location, or its leader; if an existing name belongs to the wrong region, report the conflict rather than silently moving it. Apply the migration to the target production database before deploying code that permits blank locations. Do not create or alter any other production records.
- On the cell management page, an admin or pastor may create a group with an optional location and edit name, region, and location as before. Empty location is stored as `NULL`, and all screens display **Location not assigned** instead of an empty value. Existing nonempty locations are preserved.
- Make cell-list and detail types accept `string | null` for the location. A group without a location may still receive a leader and members; scheduling/attendance behavior is unchanged.

## Permissions and interfaces

- Keep the existing admin/pastor `PUT /api/v1/cells/:id` for full edits, validating nonempty name and region and accepting an optional location. Existing roles do not gain full edit capability.
- Add a separate location-only update route for an assigned cell leader (and admins/pastors), e.g. `PATCH /api/v1/cells/:id/location`, accepting only a nonblank trimmed `location`. On every request, verify the leader's current assignment to the active target cell in the database; an arbitrary ID or old assignment grants no access. Do not accept changes to cell name, region, assignments, or meeting data on this route. Audit the change using the existing cell update action.
- Show a location editor on the cell page for an assigned leader and on the management page for admins/pastors. A leader sees and edits only their own cell; other roles do not see the action. Use a clear success/error state and refresh the cell query after success.

## Service creation assurance

- Exercise service-creation validation and authorized `POST /api/v1/services` persistence with synthetic server tests, including a rejected time window and role denial. Exercise the `/services` form submission and resulting confirmation with a browser test. Run the project test suite and build; optionally check that the deployed page and unauthenticated service endpoint respond correctly. Do **not** create a production service merely to claim that the live workflow is perfect; state that an authenticated live creation remains unverified unless explicitly performed.

## Verification and safety

- Test nullable cell creation, two seeded groups and idempotence, location display, admin/pastor edits, leader own-cell update, cross-cell and unassigned-leader denial, and preservation of existing permissions. Check migration on the production database only with the approved deployment path; do not print private data or credentials. Preserve unrelated worktree and main-checkout changes.
