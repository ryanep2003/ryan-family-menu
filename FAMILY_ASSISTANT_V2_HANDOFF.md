# Family assistant v2 — reviewer handoff

## Scope completed

This work replaces the typed keyword fallback in the existing Help sheet with a bounded, household-aware conversation. It retains the established action chips; it is not an app-wide automation layer. The exact action boundary is documented below and in `docs/FAMILY_ASSISTANT_V2_PLAN.md`.

- `assistant-conversation.js` creates a relevance-first context pack from canonical loaded household data, keeps a short in-memory conversation, and validates citations/actions against local sources. It supports language-keyed recipe lines, structured lunches, localized inventory values, hard restrictions, dinner history, and complete current-month ledger totals.
- `assistant-proposals.js` defines the shared strict contract for allowlisted actions, source ownership/type, real calendar dates, exact scopes, IDs, and bounded arguments. The provider schema is strict all the way through: every nested action argument is required and nullable when unused.
- `netlify/functions/assistant.js` is an authenticated, bounded Responses API route using the existing model configuration and a strict typed response function. It exposes a testable handler for access, quota, provider, and timeout behavior.
- `assistant-ui.js` renders conversational answers, source cards, deep links, and only validated action proposals. A proposal has a stable ID for its assistant message: a failed additive record stays frozen across close/reopen and retries without duplication; New conversation deliberately clears that identity so an intentionally identical new request can create a new proposal. At most eight pending proposals are retained; none is silently evicted because it may hold a failed-write retry. Meal freshness includes the target, cited recipe, family members/restrictions, preferences, and rules. The model never performs a direct write.
- The Help sheet works in English and Spanish, is responsive at a 390 px viewport, and has a 16 px message field to avoid mobile auto-zoom.
- Documentation, the service-worker pre-cache/version, and focused regression tests are updated. `docs/FAMILY_ASSISTANT_V2_PLAN.md` records the capability inventory and non-goals.

## Grounding and safety

The basil scenario is covered by a fixture: a Thursday dinner links to a pesto recipe listing basil, and an unchecked grocery row is surfaced as "not checked as bought." The prompt and local sources distinguish recipe/list evidence from proof that food was bought, cooked, or used. Source cards are rendered from locally validated data, not model-provided content.

The route validates the household key before use, sends no household key to the model, uses `store: false`, caps request/history/context/output/timeout, and uses the existing per-route usage guard. The route’s existing per-instance 30/day guard is not a distributed hard spending cap.

Conversation history is bounded and stays available through ordinary navigation/reopening; New conversation, household exit/lock, or reload clears it. Abort/generation checks prevent a stale response from reaching a reset or reopened sheet. Assistant requests now keep their 15-second browser deadline even when an external cancellation signal is present. Meal proposals recheck the cited recipe, restrictions, preferences, and target meal before applying; unsupported exact-item moves are refused so duplicate and leftover-linked items stay in the meal editor. No new local-storage or persisted-data field was added.

## Verification performed

- `npm run check:fresh-main` passed before baseline-sensitive work.
- Upstream `ae0a0fa` (the non-overlapping schedule fix) was fast-forwarded into this dirty worktree after a separate isolated checkout passed. The dirty assistant changes were preserved.
- `npm test` passed: 489 tests after integration and the final correction batch.
- `git diff --check` passed after the correction pass.
- The exact local command `PLAYWRIGHT_MODULE=/Users/ericpersonal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright node scripts/assistant-browser-harness.mjs` exited 0. It passed against canonical local-only fixtures: a fixed-clock Thursday Pesto pasta plan, compact-catalog ingredient evidence for fresh basil/albahaca, an unchecked linked basil grocery row, and At Home olive oil. It asserts that this context is posted to the assistant in English and Spanish; exercises add/retry/reopen/repeat and edit grocery, add/update inventory, record leftovers, and replace a meal through their actual versioned `PUT` requests; then confirms the saved grocery/inventory collection envelopes render after reload. The harness now writes an ignored screenshot plus JSON request/status/error trace on any synthetic failure. It captures console errors, page errors, and request failures. Its PWA portion serves the explicit released v177 revision as bytes, resets canonical fixture data after that release’s bootstrap behavior, verifies offline reopen of the release and the final v180 shell/cache after `controllerchange`, then verifies final-shell offline reopen. Evidence is under ignored `test-artifacts/assistant-browser/`; the reusable script contains no user-specific runtime path.
- `npm run eval:assistant-model` was prepared and run without a key; it made no model call and reported that `OPENAI_API_KEY` is unavailable. When an authorized key is supplied, its nonprivate synthetic fixture is capped at one to three calls, uses the exported production Family Help provider request/instructions and response sanitization, has a 14-second transport deadline, and checks expected citations/actions plus forbidden unsupported claims. It is still an external model-quality gap until someone with approved nonprivate model access runs it.

## Review / release notes

- No commit, push, deployment, production household read, or real-model request was made.
- The browser test used controlled mock data only; its local mock server is stopped after the check. Screenshots are retained locally in ignored test artifacts, not committed or publicly exposed.
- The service-worker cache version/module graph is covered by automated tests. A full install/update/offline-reopen lifecycle on a deploy preview or production-like host remains a release verification step.
- Existing editors are deep-linked where available. Chat can safely preview/confirm only one grocery add/edit/check, one inventory add/update, one meal add/replace for a resolved date and period, actual leftover recording, and an exact-date shopping refresh. Additive operations freeze their record/ID before the first save so a failed retry cannot duplicate them; successful proposals are consumed. Exact-item moves (including duplicate or leftover-linked meals) remain in the normal editor rather than being inferred. Meal serving-count changes are limited to adult-only plans, preserving child/guest splits by opening the normal meal editor instead. Preferences, recipes, lunches, receipts, budgets, account controls, destructive operations, and every other unlisted workflow remain ordinary-screen workflows.
