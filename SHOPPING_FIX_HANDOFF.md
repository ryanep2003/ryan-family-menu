# Shopping fix handoff

## Final independent verification — 2026-09-05

- Final full-suite rerun: **439 passed, 0 failed** (supersedes earlier interim counts).
- JavaScript syntax checks, `git diff --check`, PWA import-graph/cache-version tests, and live `origin/main` freshness check passed.
- Isolated headless Chrome with synthetic household data passed at 360px in English and Spanish, and 1280px in English: zero-bought action hidden, optional receipt access available, counted direct transfer stays in Shopping without opening a wizard or writing receipt/budget records, no horizontal overflow or runtime errors.
- The immutable v173 baseline reproduced a cleared item returning after failed sync and browser restart with a newer remote list. Version 174 passed that same sequence, retaining the deletion and genuine remote additions through explicit retry and another reload.
- No commit, push, deployment, or production household-data changes. Original dirty checkout remains untouched. Receipt recognition against the external AI service was not exercised by these synthetic browser checks.

## Implemented

- The Shopping list is the primary surface; the large always-visible completion banner is gone.
- A compact direct **Move bought items to At Home** action appears only after items are checked and leaves the shopper in Shopping.
- Receipt photo and manual entry remain optional under list tools.
- A bounded household-scoped local journal preserves unsynced grocery edits and deletion baselines across reload, delayed reads, temporary failures, and conflict retries.
- Serialized saves return the result of each submitted change instead of reporting a queued failure as success.
- Grocery load/sync messages no longer claim the device is offline when the actual failure is unknown.

## Intentionally unchanged

- The shared grocery Blob record, endpoint payload, version envelope, household access, inventory record, receipt record, and saved-list records are unchanged.
- Ambiguous inventory matches remain advisory.
- Clear checked and clear entire list remain separate; clear entire list still requires confirmation and offers one local Undo.

## Remaining gaps

- The pending journal is understood only by this client version. An older cached client can read the ordinary local list but cannot replay the deletion baseline if used before the pending write settles.
- Receipt recognition still depends on the existing configured server function and AI availability; manual receipt entry remains the fallback.
