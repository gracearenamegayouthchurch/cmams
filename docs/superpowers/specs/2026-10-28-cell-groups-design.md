# Cell groups and Saturday meetings — CMAMS V1

## Goal and boundaries

A cell is a named Saturday fellowship community with a meeting location on campus, separate from a member's **compound** (where they live), church departments, and church services. One person belongs to at most one active cell; one Cell Leader staff account is assigned to at most one active cell. Cell attendance is never stored as church-service attendance.

This design follows [Registration details](./2026-10-28-registration-details-design.md). The registration form adds its optional cell selector when the catalog and assignment APIs are ready.

## Roles and permissions

- **Admin and Pastor Viewer:** create and archive cell groups, edit names and meeting locations, assign/change cell leaders and assign/move members, create/open/close Saturday cell meetings for any cell, and see their cell records. Pastor Viewer keeps its current permissions elsewhere; cell management is a deliberate exception to its otherwise read-only role. Pastor cannot create staff accounts unless separately authorized.
- **Cell Leader:** a new staff role, assigned by Admin or Pastor to one active cell. Sees full member profile details for current members of *their own* cell, including contact details, compound/room, birthday (year only if supplied), and department. Can view its Saturday meeting attendance and cell-only analytics, create/open/close its meetings, and scan existing member QR cards or enter short codes for its meetings. Cannot view other cells, the global directory, church-service attendance or reports, create staff, issue cards, or change cell membership or leadership.
- Other existing roles retain their current permissions; do not silently grant them cell-management capabilities. Admin/Pastor remain the only roles that can assign or move a member into or out of a cell.
- A Cell Leader's staff identity and assignment are distinct from their member profile. A cell has at most one designated active leader; replacement clears or ends the previous leader's assignment atomically. Access is checked against the current server-side assignment on every request, not just a session claim. Unassigned leaders see an explanatory empty state and no member details.

## Cell lifecycle and membership

- Admin/Pastor create a cell with a unique name and Saturday meeting location. Edit these details without altering historic attendance. Only active cells may receive new members, leaders, or meetings.
- Archive rather than delete a cell. Archiving preserves historical membership and attendance, ends its current assignments, prevents further meetings/check-ins, and immediately revokes former leaders' access. Admin/Pastor can reassign its former members to another active cell; do not silently move them. Historical records stay available to Admin/Pastor.
- Record member moves with effective dates (or equivalent history) so past meeting attendance remains attributed to the cell where it occurred. A current member list must reflect the latest active assignment. Enforce one current cell per member at the database level and guard against concurrent moves. Existing members can start unassigned; optional cell assignment at registration uses the same rules.
- Audit create/edit/archive, leader assignment, member assignment/move, meeting transitions, and manual corrections, recording actor and affected entity without logging private profile contents.

## Saturday meetings and check-in

- Admin/Pastor can schedule a Saturday meeting for any active cell; a Cell Leader can schedule one for their own active cell. Capture start time and check-in window in the church's local time, display it with a clear time zone, and store instants in UTC. Require a Saturday date and an opening/closing window with close after open. Do not automatically create recurring meetings in this V1 feature.
- Only an authorized actor can open a meeting during its window and close it. Scanning uses the existing QR card/short-code credential lookup but writes to a **separate cell-meeting attendance table**, not `attendance_records`. A successful check-in requires an active card and current membership in that meeting's cell; duplicates are idempotent and cross-cell scans fail without disclosing another cell's member information. Show safe error messages for unknown, revoked, out-of-cell, closed, or repeated scans.
- Leader-facing screens show their own current cell members and only Saturday cell-meeting attendance/aggregates for that cell. Member detail responses for this role must never include `attendance_count`, `last_attended_at`, or any church-service history. Analytics cover Saturday attendance counts and trends for the leader's cell only; no church-wide totals or member-service comparisons.
- Admin/Pastor can inspect cell history across groups as needed for management. Existing church-service scans, dashboards, exports, and reports continue to use only church-service data and do not count cell meetings. No member-facing login or invitation is added.

## Data flow, security, and rollout

- Add `CELL_LEADER` to the staff role enum and role/UI mappings; extend staff creation/assignment for this role while preserving existing first-login password rotation, session revocation, and audit behavior. Add tables for cells, leader assignments, member assignment history, meetings, and meeting check-ins, with foreign keys and unique constraints on current assignments and per-person-per-meeting attendance. Keep RLS enabled and server-only DB access.
- Build dedicated cell-scoped endpoints and screens rather than reusing the global member history or service check-in endpoints. Derive cell scope from authenticated staff ID and current database assignment; all list, detail, scan, analytics, and mutation requests must independently enforce it. Do not trust a cell ID from the browser to grant access. Remove sensitive data from errors and logs.
- Apply database migrations before deploying endpoints or adding `CELL_LEADER` accounts. Roll out the registration cell picker only when cells and assignments are available; keep current service workflows working throughout.

## Verification

Test role matrix for Admin, Pastor, Cell Leader, and existing roles; assignment/move/archive races; leader replacement and revocation; cross-cell list/detail/search/scan/analytics denial; no church-service attendance leak (including indirect counts); duplicate/revoked/out-of-window scans; historical cell attendance after moving or archiving; and unchanged global service check-ins. Include browser tests for creating a cell, assigning a member and leader, and recording a Saturday check-in.
