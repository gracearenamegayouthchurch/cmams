# Registration details — CMAMS V1

## Goal and scope

Expand the existing Registration Desk flow for this single church. Keep duplicate review, privacy consent, card issuance, and manual check-in intact. This document covers member profile data and registration; Saturday cell operations and staff access are defined separately in [Cell groups and Saturday meetings](./2026-10-28-cell-groups-design.md).

## Registration experience

- Require first and last name, email, compound, birth month and day, and consent. Phone remains optional (E.164 format when provided); middle name, room, birth year, active department, and cell are optional.
- Show birth month and day as required controls and an explicitly **optional** year control; never ask for or fabricate a year when it is withheld. Validate actual calendar dates (including February 29 with an absent year); validate the full date if a year is entered. Do not send a partial date as a UTC timestamp.
- Choose a compound from the existing `compounds` catalog and at most one active department from `departments`. Only active options can be selected. Provide a small Admin-only catalog-management interface/API to add, rename, or deactivate compounds and departments: the existing schema has these tables but no registration choices or guaranteed seed data. If no compound is available, block registration with a clear request to an Admin to maintain the catalog; do not silently save an unrecognized free-text compound. Deactivation must not erase existing member associations.
- Room is free text. The optional cell is selected from active, named cell groups **after the cell-group catalog exists**; no free-text cell assignment. If registration ships before cell management, defer only the cell selector to the cell rollout; all other agreed registration fields can ship first.
- Re-check potential duplicates before registration using the current name/phone flow, and additionally treat an email match as a review signal, not an automatic refusal: relatives may share contact information. Keep the explicit confirmation for distinct people. If any identifying field used for matching changes, clear previous match confirmation.
- Update the privacy notice before asking consent to name email, compound/room, birthday (optional year), department/cell, and attendance use. Do not imply a cell leader can see a member until the cell features and permissions are live. Do not send email on registration (Resend remains deferred).
- Show field-level errors, preserve entered values after failed submission, and retain the existing one-profile-per-person and issue-card-after-save flow.

## Data and interfaces

- Add nullable `email`, `room`, and `birth_year` columns to `people`; use existing `birth_month`, `birth_day`, and `compound_id`. Maintain one normalized active department association per person using the existing `person_departments` history. Cell membership is specified in the cell-group design.
- For new registrations, validate email, compound, and birth month/day server-side. Existing rows may lack these values; do not synthesize them or retroactively fail reads/edits. If editing existing profiles is offered, require completion of newly mandatory fields only when a profile is submitted through the updated form.
- Avoid a unique constraint on email; use normalized address matching for duplicate review and reasonable length limits. Do not expose the new fields automatically in existing directory, scanner, reports, or exports: each read must explicitly choose its permitted fields. Staff with an authorized full-profile view may see the new details; new Cell Leader rules are in the companion spec.
- Enforce at most one active department association per person and preserve old association history. Before adding a unique-active-person database constraint, inspect and resolve any existing people with multiple current departments; do not silently discard their memberships.
- Transactionally create the person and optional department assignment. Follow the existing migration-before-API deployment order; keep RLS enabled and avoid direct browser database access.

## Verification

Test required fields, optional year and phone, invalid dates including leap day, inactive/unknown compound or department, Admin-only catalog management and deactivation, duplicate-email review, transaction rollback, no duplicate person/card on retries, new privacy copy, and unchanged check-in behavior. Check that older profiles without these fields still load and that list endpoints do not accidentally reveal added personal information.
