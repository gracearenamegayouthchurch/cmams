# Hostel location choices

## Goal

When staff record a member's hostel/compound or a cell group's location in the Hostel region, make the specific boys' or girls' hostel unambiguous. Do not add gender to member profiles or change non-hostel locations.

## Choices and display

Selecting **Hostel** reveals a **Boys Hostel / Girls Hostel** selector. Boys Hostel offers **Chalet** only. Girls Hostel offers **New Tetfund**, **Tetfund**, and **Chalet**. **Needs Assessment** is not offered. The selector is a location category chosen by staff, not an inference about a person's gender.

Persist and display the complete location name, for example `Boys Hostel — Chalet` or `Girls Hostel — Chalet`, so the two Chalet entries cannot be confused. Both the category and building must be chosen before a hostel location can be submitted. Changing the category clears an incompatible building choice.

## Existing application flows

- **Registration desk:** For the Hostel region, replace free-text compound entry with the categorized hostel choices; keep free-text compound entry and suggestions for Across, Ndar, and Chikam. The saved compound uses the existing compound resolution and member association; registration remains atomic. Keep the room field independent.
- **Profile completion/edit:** Use the same hostel choices when the selected region is Hostel. Existing non-hostel compound behavior remains unchanged.
- **Cells:** When the cell's region is Hostel, use the same categorized choices for its Saturday meeting location during creation, admin editing, and leader location updates. The saved `meeting_location` remains a string. Non-hostel meeting locations remain free text; empty locations remain allowed wherever they already are. When a hostel location is supplied, it must be one of the four valid complete names.
- **Read views:** Existing member and cell views show the stored complete name without requiring new data joins or a gender field.

## Boundaries and compatibility

Keep the four existing region codes and the existing `compounds` and `cells` tables. A shared hostel-options module defines the category/building pairs, full-name formatting, parsing of recognized names, and validation; UI choices and server validation use the same rules. The API must reject arbitrary hostel compound names and invalid hostel meeting locations rather than trusting the browser. Non-hostel API behavior is unchanged.

Do not silently relabel existing Hostel compounds or cell locations: their category cannot be inferred reliably. Existing unrecognized hostel strings remain visible for review, but an edited hostel location must use a valid choice. No data migration or paid external action is required.

## Verification

Test the four allowed category/building pairs; reject a boys' hostel building other than Chalet, Needs Assessment, and arbitrary hostel text; confirm region changes clear stale choices; cover registration/profile and cell create/edit/leader APIs; confirm non-hostel free text and existing read views still work. Run the full tests, build, and scoped lint before deployment. Do not deploy or modify production data without a separate rollout decision.
