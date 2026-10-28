# Compounds and Regions Implementation Plan

**Goal:** Replace the pre-built compound catalog with free-text registration entry saved under one of four required regions, with database-enforced duplicate prevention.

**Architecture:** Keep `compounds` and `people.compound_id` as the canonical link. Add a required region and a normalized-name unique index. Registration resolves or creates the compound transactionally. Admins get cleanup tools instead of an add form.

## Tasks

1. **Schema** — migration `005_compound_regions.sql`: rename `zone_name` to `region`, validate and require the four codes, add generated `normalized_name`, reject existing duplicates, add the unique index. Add a guarded `scripts/migrate-compound-regions.ts`.
2. **Registration API** — `server/compound-regions.ts` constants and normalization; `server/people.ts` resolves/reuses/creates a compound, rejects cross-region conflicts, reactivates inactive compounds, and writes membership in the same transaction. Add `code` and `region` to the conflict response.
3. **Catalog API** — list regions and compound regions; stop compound creation from the catalog route; add compound rename/move and merge; keep department behavior.
4. **Registration UI** — region select plus compound input with in-region suggestions and cross-region warnings; send `region` and `compoundName`; update validation, privacy copy, and submit gating.
5. **Admin UI** — compounds grouped by region with member counts, rename/move, merge, and deactivate; departments unchanged.
6. **Scoped views and tests** — show region in cell member details; update server and browser tests; run full tests, build, and lint.
7. **Release** — commit and push; dry-run migration in a rollback-only transaction; apply `005`; deploy to `gamyc`; verify the live schema and unauthenticated boundaries.

## Constraints

- Migration before dependent code.
- No duplicate normalized compound names.
- Region required at registration.
- Keep church-service attendance and cell attendance separate.
