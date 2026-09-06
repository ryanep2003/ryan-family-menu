# Family Help repair handoff

## Base and scope

- Base: `70dcec584b590d335df52eca871c76a3fea3a941` (live `origin/main` verified with `npm run check:fresh-main` on 2026-09-06).
- Branch: `codex/family-help-shopping-repair`.
- No commit, push, deployment, schema change, data-key change, or production household access occurred.

## Completed behavior

- Shopping capability/how-to questions—including `can you cusomize a shopping list?`—ask whether to edit items or choose planned dates; they do not offer a rebuild confirmation.
- Date choices remain editable until **Preview changes**. Multiple dates can be selected or unselected, and a preview can return to date editing.
- Changing the typed request clears any prior preview and confirmation immediately.
- Explicit date-limited commands support today/tomorrow; unresolved week constraints ask for date selection, and budget/diet/substitution constraints are answered honestly instead of being ignored.
- Shopping previews show the exact generated proposal, dates, adds/removals/updates, quantity or coverage changes where applicable, and retained manual checked items. Any changed plan/list state requires a fresh confirmation.
- Confirmation now guards both the generated proposal and the complete input list, so a concurrent grocery change outside the selected dates cannot be deleted by an older preview. A failed save remains retryable only when the in-memory list still exactly matches that preview.
- While a shopping confirmation is saving, every guided date control is disabled and guarded in code; date checkbox focus returns to the same control after each re-render.
- Spanish quantity summaries respect the active language and retain a meaningful zero quantity.
- Static cache and shell versions are aligned at `v177`.

## Verification actually run

- `npm run check:fresh-main` — passed.
- `node --test tests/assistant-logic.test.mjs tests/assistant-ui.test.mjs tests/service-worker.test.mjs` — passed (39 tests).
- `npm test` — passed (474 tests).
- `git diff --check` — passed.
- Headless Chrome synthetic-browser harness: `/private/tmp/ryan-family-menu-helper-repair-browser-review.mjs` — passed desktop English and 390/360 Spanish. It covers the screenshot typo, multi-date draft/edit/preview, typed-input invalidation, manual checkmark retention, save failure then retry, no console errors, and no horizontal overflow.

## Independent release review

- Main reviewer reran all 474 tests, freshness and diff checks on the final correction.
- Main reviewer independently reran the synthetic desktop/mobile helper workflow.
- The earlier PWA lifecycle gap was resolved with a separate isolated HTTP/browser harness: a controlled v176 page updated to v177, reloaded the new shell, and reopened offline with no runtime errors. The household gate precedes automatic service-worker registration; the lifecycle harness explicitly registers the worker before testing the update.
- No production household data was used or changed in verification.
