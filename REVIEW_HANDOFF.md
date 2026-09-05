# Ryan Family Menu recovery handoff

This release was recovered onto live `origin/main` at `62dd5bfe45132461d5fe2f272fd02f28543bbee8`. The original dirty checkout was preserved separately. The user explicitly authorized deployment after reviewing the version 172 phone preview.

## Verification

- `npm test`: 431 passed, 0 failed at the release gate.
- `git diff --check`: passed.
- `npm run check:fresh-main`: HEAD matches live `origin/main`.
- `node --check` passed for the changed application modules.
- Preview: `http://localhost:4180`.
- Synthetic browser review covered startup, Spanish Shop at narrow width, recipe cancel, calendar arrow focus, Plan persistence, and reproduced the delayed and queued-save cases that motivated the final coordinator fix. The final serialized/rebased save behavior is covered by executable deferred, 503, 409, cross-surface, and receipt-ledger regression tests. A post-v172 browser rerun remains pending because the Mac is currently locked. The preview contains no production household data or secrets.
- Independent review additionally executed the actual application merge/save functions and dirty-form tracker with a controlled transport: queued saves preserved the newer submission; a first-request conflict followed by a queued save retained unrelated remote edits; a third later edit remained dirty; a queued 503 retained local changes and a subsequent retry succeeded.
- The user's version 172 phone screenshot confirmed the current navy/cream Today view, Help button, and four-tab mobile navigation. This is appearance evidence, not a full interaction test. The final locked-Mac browser rerun and native offline/install checks remain disclosed verification gaps.
- Release preflight found the existing `recipe-catalog-utils.js` import missing from the static pre-cache. Version 173 adds that entry and a recursive import-graph regression test; no application behavior or styling changed from the reviewed version 172. The test failed before the cache entry was added and passed afterward.

## Coverage

Implemented: Month calendar/accessibility, bilingual ordinary-content fallback, fail-closed safety content, dirty-form protection, empty Shopping action, parallel startup loading, ledger write/migration safety, AI usage serialization, inventory controls/matching, mobile household context, information architecture cleanup, key-rotation UI decision/documentation, Next best action, Plan from what we have, caregiver handoff, dinner feedback/ranking, and grocery confidence summaries.

Intentional decisions: Plan keeps one explicit Save action because its existing conflict path is safer than introducing autosave; key rotation UI is hidden because the endpoint is not production-ready; no persisted-data migration, dependency, deploy, or top-level navigation change was added.

Deferred: full application-wide targeted rendering when no form is dirty. Dirty surfaces already skip replacement renders, and save completions clear only the generation that was submitted.

## Save safety

Save responses carry a dirty-surface generation snapshot. Each save request also captures an immutable submitted intent and its server baseline. Requests execute serially, rebase that intent over the newest server baseline, and preserve remote-only changes plus later unsubmitted local edits. An older success, 503, 409 merge, retry, or queued save cannot clear or replace a newer draft. Explicit cancellation clears only the cancelled form. Ledger migration is owned by the ledger loader and waits until the ledger state is known; positive-version empty ledgers remain empty.
