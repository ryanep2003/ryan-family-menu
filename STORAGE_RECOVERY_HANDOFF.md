# Shopping storage recovery handoff

## Final independent release verification

- Final full suite: 461 passed, 0 failed; syntax, whitespace, and live-main freshness checks passed.
- Isolated Chrome with genuinely exhausted localStorage loaded 54 synthetic groceries despite cache failure, saved a checked item to the shared mock, and recovered that state after a fresh browser context reopened.
- Failed shared save plus full storage preserved the in-memory edit; retry through a version conflict retained an independent remote addition. English/Spanish switching at full quota produced no runtime error or horizontal overflow.
- Blocking both acknowledged-journal rewrite and removal showed the explicit keep-open warning. Retry performed local cleanup without another PUT; after storage recovery and cleanup, reopening retained a newer remote edit without replaying the old one.
- Existing failed-GET retry, duplicate-request coalescing, pending-clear reload, failed-PUT retry, late-GET failure, and real 15-second save-timeout browser checks passed.
- Controlled v175-to-v176 worker update, reload, and offline shell reopening passed. These tests used synthetic household data only; no production records were modified.

## Problem

Shopping treated its household-scoped browser cache and pending journal as prerequisites for shared sync. A quota or storage-policy failure could stop a valid grocery `GET` before render or abort a local edit before its `PUT`, leaving Shopping on a device-storage warning even when the shared service was available.

## Repair

- Validated shared grocery reads update and render the list before local-cache persistence is attempted.
- Grocery edits retain an immutable in-memory intent and continue through the existing serialized, timeout-bounded, conflict-aware cloud write when cache or journal writes fail.
- Deletions, later edits, and independent remote additions retain the existing three-way merge behavior.
- A failed cloud write plus failed local backup remains pending in memory and explicitly says the edit is neither shared nor durably saved; Retry remains available while the app stays open.
- A successful cloud write is reported as synced. If its offline backup fails, the UI separately says that the offline copy is unavailable and does not offer a redundant sync retry.
- Cloud acknowledgement rebases the existing journal to a no-op server baseline before clearing it. If either the rewrite or removal succeeds, an older edit cannot replay on reopening.
- If both acknowledgement rewrite and removal fail, the UI says cloud sharing succeeded but safe local recovery cleanup is still pending. Retry performs only one local cleanup attempt and never repeats the cloud write.
- Blocked version-cache reads now fall back to version zero so Shopping can recover from the shared endpoint.

## Compatibility

- Grocery endpoint, household scoping, storage keys, journal schema, IDs, and field meanings are unchanged.
- No other domain save path changed.
- PWA shell references and cache are aligned at v176.

## Verification

- Started from clean deployed main `95c4975` (v175).
- Full automated suite passed: 461 tests, 0 failures.
- Focused storage/retry/language/PWA suite passed: 55 tests, 0 failures.
- JavaScript syntax checks and `git diff --check` passed.
- Automated browser control was unavailable because the Mac was locked; the release reviewer still needs to exercise the v176 Shopping load/save and quota scenarios in the rendered app before deployment.

## Exact limitation

When browser storage rejects both rewriting and removing an old pending journal, the accepted cloud edit is safe but reopening could still read that stale journal after storage access returns. The app therefore does not claim reload safety in this state and asks the family to keep it open until the local-only Retry succeeds. No new acknowledgement key or journal schema was introduced.
