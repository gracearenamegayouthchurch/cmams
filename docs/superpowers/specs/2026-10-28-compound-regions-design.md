# Compounds and regions — CMAMS V1

## Goal and scope

Compounds are too numerous to pre-load and maintain as a catalog. The registration desk types the compound the member gives, and the app saves it for reuse. Every compound belongs to one region so members can be sorted cleanly. This replaces the compound-catalog part of [Registration details](./2026-10-28-registration-details-design.md); departments remain a curated catalog.

## Regions

Four fixed regions: **Across**, **Ndar**, **Chikam**, **Hostel**. Region is required at registration. A compound name exists once across all regions; the same name cannot be saved under two regions.

## Registration experience

- The compound dropdown is replaced by a required **Region** select and a required **Compound** text field.
- As the worker types, the field suggests compounds already saved in the selected region. Selecting a suggestion fills the compound name and its region.
- If the typed name matches an existing compound in a different region, the form shows that compound and its region so the worker can use it instead of creating a second copy.
- A name that does not exist is created automatically under the selected region when the person is saved. No Admin setup is needed first.
- Compound matching ignores capitalisation and repeated spaces: `east gate`, `East  Gate`, and `East Gate` are the same compound.
- The privacy notice names compound and region.

## Data and interfaces

- Rename the unused `compounds.zone_name` column to `region`; require one of the four region codes and keep a check constraint.
- Add a stored `normalized_name` generated from `lower(regexp_replace(trim(name), '\s+', ' ', 'g'))` with a unique index. This is the database guarantee against duplicates, including concurrent registrations.
- Registration accepts `region` and `compoundName` instead of `compoundId`. It resolves an existing compound by normalized name, rejects a region mismatch with a clear error, creates a missing compound, and links `people.compound_id` in the same transaction.
- A deactivated compound is reactivated if it is entered again.
- `GET /api/v1/catalogs` returns active compounds with their region plus the four region choices.
- Admins can rename a compound, move it to another region, merge a duplicate into another compound, and deactivate it. Merging moves current member links and attendance snapshots to the surviving compound, then deactivates the source. Compounds are no longer created from the catalog screen; departments keep their existing add/rename/deactivate flow.
- Cell member views show the compound region.

## Verification

Test automatic creation, reuse of a normalized name, cross-region rejection, concurrent-safe uniqueness, region-required validation, catalog rename/move/merge, registration UI suggestions, and that no duplicate normalized name can be inserted. Verify the migration in a rollback-only transaction against the approved church database before applying it, then deploy and check the live registration screen.
