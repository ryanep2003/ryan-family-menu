---
name: safe-database-change
description: Plan and implement safe changes to Ryan Family Menu persisted data, Netlify Blob records, local household fallbacks, IDs, ownership, versioning, or migration behavior. Use whenever a feature changes stored field shape or meaning, record keys, household relationships, synchronization, or production data. Never perform destructive production-data operations without explicit approval.
---

# Safe Database Change

Treat Netlify Blob JSON and household-scoped browser storage as the database, even though there are no SQL tables.

## Understand the Current Contract

1. Read `AGENTS.md` and `docs/DATA_MODEL.md` completely.
2. Inspect the relevant client normalizer, snapshot, local persistence, endpoint, server sanitizer, Blob store/key, version envelope, UI consumers, and tests.
3. Search for every read and write of the affected field, ID, or record key.
4. Identify ownership, household namespace, limits, legacy forms, and conflict behavior.
5. Determine whether older clients, cached service workers, existing local fallbacks, or code rollback must read the new data.

Do not infer production shape from one example object. The server sanitizer and tolerant readers define the contract.

## Classify Risk

State whether the change is:

- additive with a safe default;
- a semantic change to an existing field;
- a relationship or ownership change;
- a record-key/store change;
- a one-time backfill;
- destructive.

Identify records requiring migration, maximum affected scope, rollback difficulty, and the consequence of an interrupted write.

## Design the Compatibility Path

Prefer this sequence:

1. Add tolerant readers/normalizers that accept old and new forms.
2. Deploy readers before requiring new writes when multiple releases are necessary.
3. Add bounded, sanitized writers for the new form.
4. Keep legacy fields synchronized while older clients may depend on them.
5. Add explicit format versioning only when shape detection is insufficient.
6. Preserve optimistic-version checks or deliberately define replacement concurrency behavior.
7. Remove legacy support only after an explicit, verified migration decision.

Never bypass household access, use unscoped local storage, silently regenerate stable IDs, or overwrite a conflicting server copy.

## Production Data Safety

For a backfill, rewrite, or deletion:

1. Resolve exact Blob store names and household-scoped keys.
2. Verify a recoverable backup without printing private contents.
3. Test against representative copies, including malformed and legacy records.
4. Make the operation restartable and bounded when practical.
5. Define success checks and rollback.
6. Obtain explicit approval for the exact production mutation.

Do not use broad globs, store-wide deletes, or an unverified household ID for destructive actions.

## Implement and Test

Update all applicable layers together:

- client normalization;
- local storage read/write;
- snapshot or request payload;
- server sanitizer and collection limits;
- Blob envelope/version behavior;
- UI and translations;
- service-worker module graph;
- automated regression tests;
- `docs/DATA_MODEL.md` and, for durable decisions, `docs/DECISIONS.md`.

Test old records, new records, missing fields, invalid fields, size limits, round-trip persistence, two-client conflicts, local fallback, household isolation, and rollback compatibility. Run `npm test` and `git diff --check`.

## Report

Explain the old and new shape in plain language, why existing households remain safe, what migration or backfill is required, checks actually run, and any rollback limitation.
