# Ryan Family Menu — week one execution plan

Status: the week-one core passed controlled-preview acceptance and was deployed to production September 28 at `4343ece` (app-shell version 215). The earlier Days 1–4 slice was deployed September 25 at `b7f6881`. Private household writes and physical-phone use remain follow-up checks, not claims made by the deployment smoke test.
Planning date: September 22, 2026. Target window: September 23–29, 2026, America/New_York.
Dates are work targets, not scheduled agent runs or a promise of deployment.

## Outcome

A family can draft a useful week, keep meals it likes, approve the draft, build the matching shopping list, adjust a disrupted evening, and record dinner feedback that improves later suggestions. The experience works with partial household data and remains useful without a model call.

Week-one success is this complete, tested flow in a local or controlled preview. Production deployment requires a separate explicit request and the repository release gate.

## Scope and sequence

The ten recommendations remain the product direction. This week delivers the first coherent slice of Today, weekly planning, change-of-plans, transparent memory, and adaptive ranking; bounded AI remains conditional. It lays foundations for pantry confidence, connected leftovers/lunches, budget-aware planning, and measured improvement without promising their full automation.

Must deliver:

- A seven-date dinner draft using the household's existing recipe catalog, attendance/servings, explicit restrictions, quick-night constraints, favorites, history, and advisory home-food matches.
- Keep/lock individual draft meals, replace a suggestion, and regenerate only unlocked choices.
- Explicit approval through the existing date-specific schedule workflow, preserving breakfast, lunch, sides, handoffs, and unrelated dates.
- A reviewable shopping-list update using existing scaled, idempotent generation.
- A change-of-plans flow for a time constraint or changed attendance, with a preview of affected meals and groceries.
- A clearer Today view and evidence-based family-memory view with editable existing preferences.
- The five experience requirements below: structural loading states, useful prefilled controls, safe immediate feedback, recoverable unfinished work, and clear errors with recovery.
- No model calls on app opening, rendering, language changes, ordinary ranking, or dinner feedback.
- English/Spanish parity, household isolation, mobile usability, existing offline behavior, and finite conflict handling.

Conditional addition: one explicit natural-language request action that converts text into validated planning constraints. Release only if its provider, access, cost, safety, and fallback checks pass. The core release must not depend on it.

Defer full pantry auto-depletion, new price databases, precise grocery cost forecasts, calendar integration, push notifications, autonomous code changes, advanced reinforcement learning, account-system migration, and framework/database replacement. Preserve current lunches, inventory, receipts, Cook Along, library, and manual planning.

### Five experience requirements added September 25

These are part of the overhaul's core experience, not an optional visual-polish list. Apply them to the week-one journey first, then audit the existing high-use Today, Plan, Shop, and recipe flows without rewriting unrelated screens.

1. **Structural loading states:** When a screen has no usable cached content, show a lightweight outline of its real cards, rows, or controls while loading. Keep it accessible, respect reduced motion, and avoid a flash when cached content is already available. Loading, empty, offline, and failed states must remain distinct. Do not use broad asset pre-caching or polling to create the effect.
2. **Smart autofill:** Prefill attendance, servings, household preferences, and other known values from the correct current household/date when relevant. Make every value visible and editable. Never invent a restriction, purchase amount, inventory quantity, or family preference; do not overwrite a field someone is actively editing when a background refresh arrives.
3. **Safe immediate feedback:** Show an action's local result promptly and label it pending until shared saving is confirmed. Preserve a usable retry or reversal when saving fails. For conflict-sensitive approval, grocery updates, dinner swaps, and Undo, keep the fresh-record/version check before claiming shared success; speed must not silently overwrite another person's edit.
4. **Recoverable unfinished work:** Keep the existing household-scoped saved state and add recovery for an unfinished weekly dinner draft, including kept choices and selection, after reload or accidental close. Use a bounded local format, validate it against the current household, week, recipes, and schedule baseline, and ask for review when stale. Do not treat a recovered draft as approved or synced. Preserve unfinished high-use form work where it is safe and useful, without storing secrets or photos indiscriminately.
5. **Clear errors and recovery:** Translate failures into plain English/Spanish messages that say what happened, whether the change is local/pending/shared, and the next useful action. Keep input or draft work when an operation fails. Do not show raw HTTP codes, server text, or backend stack messages in ordinary product UI. Offer a finite retry, review, or manual fallback appropriate to the action.

Acceptance for this track: a first-load/no-cache fixture shows structural loading then real content; known fields prefill without overwriting active edits; a slow/failing save shows immediate but truthful feedback; a weekly draft survives reload without auto-approval; and offline, conflict, and server-error fixtures preserve work and show an actionable localized next step. Check these at 360/390px and desktop, with keyboard/focus and reduced-motion behavior where relevant.

## Baseline facts and ownership

- Current branch at planning time: `main`.
- Pre-existing changes: `schedule-utils.js`, `tests/schedule-utils.test.mjs`, and untracked `__qa_shopping.html`. The scheduling change makes missing schedules empty instead of inventing demo meals. Preserve these changes and their provenance; do not reset, overwrite, or fold them into a redesign commit without inspecting current ownership.
- Recheck the working tree before every assignment. This inventory can become stale.
- `docs/AI.md` currently understates usage controls: `netlify/functions/_ai-usage.js` already stores daily per-household/per-route request counts, used by several AI endpoints. It does not establish token-dollar accounting or a strict cross-instance reservation guarantee. Its lock is process-local and its read-error behavior needs review. Extend and verify the existing path; do not create a competing ledger.
- `app.js` owns `saveSchedule`, local schedule persistence, conflict reconciliation, grocery generation, and dinner-history coordination. Preserve the smaller schedule record and legacy readers.
- The application's own API model remains unchanged. Development-agent selection is separate and is defined below. Read the applicable AI gateway skill and current official documentation before any future application model selection or change.

## Development models and usage budget

User-approved model allocation (September 22, 2026):

- GPT-6 Sol, Medium reasoning: primary implementation and integration.
- GPT-6 Luna, High reasoning: narrow, well-specified UI changes, localization, focused test work, and documentation when delegation saves work. Do not duplicate the lead agent's work.
- GPT-6 Astra: only a targeted architecture/data-integrity review or difficult unresolved issue; not routine daily execution. Require a concrete reason and a bounded assignment before escalation.
- Prefer Standard speed. No automatic Fast, Max, or Ultra escalation. A saved plan is not proof that the task's actual model/speed settings changed; verify controls/tool results before claiming configuration success.

Initial conservative operating budget:

1. Read the live account usage limits before implementation, after a substantial work chunk, and at handoff. Check between design, implementation, and verification stages; no background polling or monitor is needed.
2. Target no more than 5 percentage points of the weekly allowance per work session. End a session at the next safe checkpoint when its observed weekly consumption reaches that target; do not automatically start another session to bypass the target. Larger daily assignments may span several sessions.
3. Reserve at least 25% of the weekly allowance and 20% of the five-hour allowance. At or below either reserve, save a concise handoff and do not begin another substantial stage. A finite, essential verification of edits already made may be completed; otherwise record it as pending rather than claiming the work passed.
4. Use one executing coding agent at a time by default. Sequential Luna delegation is permitted when helpful; do not run a team simply because slots are available. The coordinator should avoid duplicate inspection or tests.
5. Use focused file reads, compact handoffs, and bounded reviews. After required checks pass, do not repeat them without new changes, failures, or an unresolved concern. Reuse the existing concept images; no extra image generation merely for polish.
6. Record before/after allowance percentages, reset times, model, completed scope, and remaining work in the usage journal below. Account-wide percentage changes are approximate context, not exact attribution to this project. If the window reset during a session, do not subtract across it as though it were continuous. Missing usage is unknown; avoid launching a long autonomous batch without a fresh reading.
7. These are agent-followed pacing rules, not an enforced platform token/dollar ceiling. A long call can overshoot a checkpoint, percentages are rounded, other tasks share the account, and usage reporting can lag. Do not promise a fixed number of tokens or that the whole week fits a particular allowance. Calibrate after the first real Sol implementation session.
8. No purchased credits, reset-credit redemption, recurring automation, or application API spending is authorized by this development-budget setup. A reset requires explicit user confirmation. The app's own OpenAI/Netlify costs remain a separate budget from Codex development usage.

Official references checked: [model selection](https://learn.chatgpt.com/docs/models#choosing-sol-terra-and-luna), [usage and pricing](https://learn.chatgpt.com/docs/pricing). Credit rates alone do not establish included-plan allowance consumption.

### Usage journal

| Checkpoint | Model/work | Five-hour remaining | Weekly remaining | Reset times (Eastern) | Notes |
|---|---|---|---|---|---|
| September 22 setup, initial reading | Planning and configuration; no implementation | 53% | 68% | Five-hour: Sep 23, 2:05 a.m.; weekly: Sep 24, 9:20 a.m. | Plus; account-wide snapshot, not a token count. One unused full reset available; not redeemed. |
| September 22, Day 1 start | Sol Medium; design contract and screen study | 44% | 67% | Same as above | Account-wide snapshot. |
| September 22, Day 1 checkpoint | Sol Medium; contract, mobile study, focused foundation checks | 36% | 65% | Same as above | 54 focused checks passed; 360/390px prototype showed no horizontal overflow or console errors. Account-wide change is not exact project attribution. |
| September 22, Day 2 checkpoint | Sol Medium; pure planner and bilingual home-food match | 28% | 64% | Same as above | 347 tests passed; planner is not wired to the app. |
| September 22, Day 3 foundation start | Sol Medium; conflict-safe approval preparation | 27% | 64% | Same as above | Began a bounded continuation before the five-hour reserve. |
| September 22, Day 3 foundation checkpoint | Sol Medium; approval contract tests and verification | 23% | 63% | Same as above | 353 tests passed. Stopped before larger UI/save integration to protect the 20% five-hour reserve. |
| September 22, Day 3 continuation checkpoint | Sol Medium; active-week safety and integration trace | 21% | 63% | Same as above | 354 tests passed. Stopped at the reserve boundary; no UI/save integration started. |

## Working method for the executor

Execute one bounded daily assignment at a time. A calendar date never overrides a failing gate. Complete ordinary fixes within the assigned scope; report material scope expansion or a blocker with evidence. Do not repeatedly request permission for routine reversible implementation work.

Before implementation, read root `AGENTS.md`, the relevant repository skills, and the product/design/architecture/data documents. Use `build-feature`, `safe-database-change` when persistence changes, `test-mobile-pwa` for visible/PWA work, and `pre-deploy-check` for the final release assessment. Use Impeccable for design implementation, carrying forward the user's accepted concept direction while obeying actual interaction/accessibility constraints.

Prefer an isolated `codex/` branch/worktree for implementation if other work is active. A new worktree will not contain current uncommitted changes: inspect and explicitly account for that baseline rather than assuming it is identical. Do not manipulate the existing changes merely to create a clean diff.

Each assignment ends with: changed files and behavior, checks actually run, unresolved risks, and the next ready assignment. Keep implementation checkpoints small and reviewable. Do not push, merge, deploy, change secrets, or mutate production data under this plan alone.

## Accepted visual direction to explore

Use the concept's clearer task hierarchy, warm ivory surfaces, dark plum text, restrained tomato accent, modern readable sans-serif typography, selective food photography, and short factual explanations. Keep error/danger styling distinguishable from primary actions. Actual controls, contrast, navigation selection, recipe times, names, and meal states must come from implementation truth; generated image details are not specifications. Do not remove functionality to reproduce a picture.

Local concept references from this planning conversation:

- [Today and change-of-plans concept](/Users/ericpersonal/.codex/generated_images/01a0cbc7-f80f-71f0-a8dd-dd31f3382b98/exec-99644c47-2062-4613-ae59-b9d470db07cd.png)
- [Week and family-memory concept](/Users/ericpersonal/.codex/generated_images/01a0cbc7-f80f-71f0-a8dd-dd31f3382b98/exec-28ce7164-e8a5-48c9-97ab-0095904f7cdd.png)

These local brainstorming assets are not shipped application assets. View them before using them as design references; if unavailable on another machine, use the written direction and report the reference gap.

## Day 1 — Wednesday, September 23: establish the contract and design

Deliverables:

- Baseline audit and `npm test` result, with pre-existing failures distinguished from new work.
- Trace planning → schedule save → shopping generation → dinner history end to end. Verify stale-client and local-fallback behavior from source and controlled tests.
- A lightweight local prototype or representative screens for Today, week draft, change-of-plans, and family memory. Use illustrative data. The existing generated images express direction, not exact component specifications or verified food timings.
- A short implementation contract defining draft shape, apply semantics, supported constraints, empty/unknown states, boundaries between shared records, and relevant function ownership.
- A fixed fixture set: empty household, populated week, locked meal, no matching recipe, explicit restriction, missing recipe metadata, low/unknown inventory, changed attendance, planned versus confirmed leftovers, and English/Spanish content.

Acceptance: the design preserves the full daily meal hierarchy and five existing navigation destinations; primary tasks are clear at 360 and 390 CSS pixels; the implementation contract identifies every write and its conflict behavior. No production writes or model calls are needed.

Keep prototype fidelity bounded: one representative state per screen and a single batched review. The write/conflict contract and fixtures are the prerequisite for Days 2–3; extra visual variations must not delay them.

## Day 2 — Thursday, September 24: build the weekly planning engine

Deliverables:

- Pure planning logic in a focused module following the existing logic/UI split. Reuse `memory-logic.js`, `plan-from-what-we-have.js`, `schedule-utils.js`, and recipe utilities where appropriate.
- A bounded dinner draft for seven specific dates; preserve fixed choices and regenerate only unlocked slots. Return recipe IDs, serving targets, concise reason codes, and unresolved constraints.
- Candidate selection accounts for variety, repeat history, time, preferences, and advisory ingredient overlap. Explicit restrictions are hard constraints; missing or ambiguous information is not evidence of safety or feasibility.
- Relevant English/Spanish restriction fixtures; current substring matching must not be presented as a comprehensive allergen guarantee. If candidates cannot be verified against a declared restriction, leave a visible unresolved choice for review.

Acceptance: identical normalized inputs produce repeatable results; no writes or provider calls occur during drafting; no unknown recipe IDs, overwritten locked meals, fabricated inventory/leftovers, or silently relaxed restrictions. An unavailable catalog yields an honest recovery/manual state.

## Day 3 — Friday, September 25: approve the plan and connect shopping

Deliverables:

- Week preview with keep, swap, and approve actions; current manual planning remains available.
- Apply only the approved date/meal changes through existing schedule persistence. Use a base-version/snapshot check so a stale draft cannot overwrite another person's edits.
- For a date changed both remotely and by the draft since its base snapshot, stop and show the affected date for review; never let this new flow silently inherit the current whole-date local-wins merge/retry. A version check by itself is insufficient. Unaffected remote dates must survive reconciliation.
- Shopping preview and explicit update action using existing ingredient scaling, source attribution, and idempotent merge behavior. Preserve manually added and purchased/checked items; explain new quantities that still require purchase.
- Add focused coverage for a checked ingredient whose required quantity increases: a previous checkmark cannot imply the additional amount was purchased. `replacePlannedGroceries` currently carries a boolean checked state to the rebuilt ingredient; define and test an honest review state or explicit outstanding amount before enabling automatic quantity changes. Also preserve evidence of checked items removed from the revised plan rather than silently treating a past purchase as undone.
- Visible saved, pending, conflict, and partial-success states.

Acceptance: approval survives reload in a controlled fixture; breakfast/lunch, other dates, side dishes, and handoffs remain intact unless specifically edited. Approving twice or rebuilding shopping twice creates no duplicates. If schedule saves but grocery saving fails, the app reports each result accurately and offers a bounded retry.

Required conflict fixture: two devices start from the same version, one edits lunch or dinner on a target date, and the other approves an older draft for that date. The second approval must request review of the conflict and preserve the remote change until the person resolves it.

Important: schedule and groceries are separate versioned records, not one transaction. Do not fake atomic success or introduce an automatic rollback that overwrites concurrent work. Keep shopping reconciliation explicit in week one.

## Day 4 — Saturday, September 26: handle a disrupted evening

Deliverables:

- A Today redesign integrated with actual plan state, including compact breakfast/lunch/dinner visibility and one dominant contextual action.
- “Change of plans” supporting “less time” and “different number of people.” Provide alternatives from known recipes; a no-cooking choice can be an explicit manual option if recipe metadata cannot support reliable filtering.
- Preview exactly which dates, meal items, servings, and grocery contributions would change. Moving tonight's meal must not overwrite an occupied later slot.
- Cancel without mutation and a conflict-aware immediate undo for the applied plan change where feasible. Shopping remains independently reviewed; never restore an entire stale household snapshot.

Acceptance: one end-to-end scenario moves or replaces dinner, preserves locked meals and checked groceries, scales attendance correctly, and reports offline/pending saves truthfully. Date handling works across week/month boundaries.

## Day 5 — Sunday, September 27: make memory transparent and useful

Deliverables:

- A family-memory surface showing explicit preferences separately from summaries derived from actual dinner events. Every derived statement has a small factual basis and a way to correct its source.
- A quick dinner outcome action connected to existing history. Repeated saving updates the same dinner event rather than amplifying its influence.
- Conservative ranking improvements using observed outcomes, repeat spacing, and optional per-person reactions when actually recorded. Do not infer a dislike from takeout, a skip, or missing feedback.
- Existing preference edit/delete controls accessible from memory. Inferred suggestions stay advisory; do not invent a second stored fact system solely for the UI.
- Audit the changed Today/Plan controls for smart autofill: prefill from the current household and date, retain active edits during refresh, and leave uncertain values empty or clearly marked for review.
- Add bounded household-local recovery for an unfinished weekly dinner draft, including kept meals and selection. Reject or flag a recovered draft whose week, catalog, or schedule baseline changed; do not auto-approve it.

Acceptance: an outcome changes the relevant future ranking deterministically with zero provider calls; correcting feedback reverses its contribution; no-history households still get useful choices; restrictions cannot be weakened by learned preferences. A draft survives reload in the same household but cannot cross households or approve itself, and a background refresh does not replace in-progress input. Avoid unsupported claims about cooking times or contextual habits when the existing event data does not establish them.

## Day 6 — Monday, September 28: complete experience reliability; consider bounded language assistance

Deliverables:

- Add structural loading states to the first-load Today/Plan/Shop/recipe surfaces that lack usable cached content; distinguish them from empty, offline, and failed states, and respect reduced motion.
- Audit high-use saves for immediate but truthful local/pending/shared feedback. Preserve the fresh-record checks on conflict-sensitive changes and provide finite retry or review after failure.
- Replace raw server/error text in ordinary UI with localized, action-specific explanations that preserve the user's input and offer retry, review, or manual fallback.
- Finish any unmet core gates first. If ready, add one user-triggered text action for supported week-planning constraints, using a compact context and sanitized structured response.
- Provider output only supplies allowed constraints or IDs; deterministic planning and validation remain authoritative. Text that cannot be interpreted gets editable controls rather than guessed changes.
- Reuse current AI access/usage helpers; inspect concurrent reservation behavior. Record safe operational metadata and provider usage totals where available, never household text/photos/keys. Missing provider usage means unknown, not zero cost.
- A normal request makes at most one provider call, with at most one bounded repair only if explicitly implemented and included in the budget. Cache results only within the household and invalidate against relevant recipe, preference, plan, and request versions.
- Validate provider failures, malformed responses, unsupported constraints, stale results, request limits, duplicate submission, timeouts, and deterministic fallback.
- A small, opt-in pilot measurement sheet: planning completion time, accepted/changed draft meals, reported outcomes, and measured AI usage. Distinguish measured values from estimates; no new third-party analytics dependency.

Acceptance: opening, browsing, rating dinner, or recalculating groceries makes zero provider calls. Loading and failed states are visually and semantically distinct; slow, offline, and conflicting saves never claim shared success or discard unfinished work. Provider requests, if added, have bounded input/output/time/retries and tested access checks. Do not call an approximate per-process counter a hard spending ceiling. If the five core experience requirements are incomplete, mark the release not ready. If only AI spending controls, configuration, or a budgeted representative real-model check are unverified, leave the new AI action disabled and continue with the deterministic flow.

## Day 7 — Tuesday, September 29: integration and release candidate

Deliverables:

- Run the full end-to-end fixture journey: draft → keep/swap → approve → shop → change plans → record dinner → inspect later suggestions.
- `npm test` and `git diff --check`; inspect browser console/network behavior and changed UI in English and Spanish at 360/390 pixels plus desktop.
- Test empty/loading/error states, keyboard/focus return, readable contrast, touch targets, concurrent edits, household isolation, pending-save recovery, and relevant quantity calculations.
- Run the five-experience acceptance fixtures above, including first-load skeleton behavior, known-value prefills, slow/failing saves, recovered versus stale weekly drafts, and localized error recovery. Check that a loaded/cache-hit screen does not flash a skeleton and that conflict-sensitive actions never present an unconfirmed write as shared.
- Run mobile/PWA verification, including first-party module pre-cache coverage, aligned shell/cache versions, one update cycle, and offline reopen with controlled data. Report device limitations honestly.
- Update `PRODUCT.md`, `DESIGN.md`, architecture/data/AI documentation and durable decisions where shipped behavior changes. Planning prose must not prematurely describe proposed functionality as shipped.
- Release-readiness assessment, known gaps, screenshots, and rollback instructions based on the actual final scope.

Acceptance: all core gates pass or the release is explicitly marked not ready. A missed conditional AI gate removes that feature from the release candidate; it does not excuse a failing core flow. No deployment without a separate explicit request.

## Data and cost rules across every day

- Keep drafts in memory while editing and add a bounded household-scoped local recovery copy for accidental close/reload. Validate its schema and current schedule/catalog baseline before reuse; do not silently introduce shared draft synchronization or auto-approval.
- Persist approved meals and dinner outcomes using existing authoritative record ownership. Every new persisted field must update browser normalization, server sanitization, local persistence, tests, and documentation together.
- Stable IDs, legacy meal fields, household scoping, version-conflict checks, and safe rollback remain mandatory.
- Expected extra servings are planning intentions. Actual available leftovers require confirmation. Inventory matches remain advisory until verified; no automatic depletion in week one.
- Do not invent precise costs from receipt totals or quantities from item-name matches. Preserve manual corrections.
- No polling, background translation, automatic weekly model jobs, indefinite reflection, or agent-driven production writes.

## Cut line if the week becomes too full

Protect data correctness, draft/approval, change-of-plans, understandable Today, basic feedback learning, the five experience requirements, and bilingual/mobile/offline checks. Defer the new natural-language action first, then extra visual polish and richer memory insights. If the expanded core cannot pass its release gates this week, carry unfinished work into the next week and mark the release not ready rather than weakening the checks.

## Copyable Sol assignment

Use GPT-6 Sol with Medium reasoning. Read `AGENTS.md` and `docs/REIMAGINING_WEEK_ONE_PLAN.md`, including the five experience requirements and development-usage budget. Execute only the next explicitly assigned day or smaller checkpoint, using existing code and repository skills. Check live usage before starting and record it at handoff. Recheck the current working tree and preserve unrelated changes. Inspect the end-to-end flow before editing. Build the smallest coherent slice, add meaningful regression protection, run `npm test` and `git diff --check`, and perform the risk-specific browser/data/PWA checks. Keep English/Spanish parity and household isolation. Update this plan with factual completion evidence, never a guessed pass. Report what changed, checks run, unresolved issues, allowance changes, and the next ready assignment. Use Luna High only for a concrete bounded subtask; avoid duplicate work and concurrent coding. Do not push, deploy, mutate production data, redeem resets, purchase credits, or change application models/secrets. If a gate fails, fix it within scope or report the concrete blocker; do not advance automatically to the next day or through a budget checkpoint.

Initial handoff is a read-only readiness review of this plan and baseline tests. It does not authorize Luna to begin all seven days in one run.

## Day 1 completion evidence — September 22, 2026

- Wrote [the implementation contract](REIMAGINING_DAY1_CONTRACT.md), including record ownership, full-day same-date conflict handling, approval/review states, and 16 fixed scenarios for Days 2–7.
- Created [a four-screen static study](reimagining-day1-screens.html) for Today, week draft, change of plans, and family memory. It uses illustrative data and has no household/API writes or model calls. The prior concept pictures remain visual references.
- Inspected source paths through household storage, effective date plans, `saveSchedule`, versioned groceries, and dinner history. The current automatic schedule merge may prefer a local whole-date edit over a remote same-date change; approval requires a separate fail-closed rule. A new checked grocery quantity also requires review.
- The earlier whole-suite baseline was 339 passing, 0 failing, before Day 1; no application JavaScript changed in Day 1. A focused run of 54 relevant tests passed during Day 1. `git diff --check` passed for tracked changes, and the new untracked planning/prototype files passed whitespace/newline checks. The prototype was inspected in a real browser at 360 and 390 CSS pixels: no document horizontal overflow or console errors. The screen study is English only; implementation and later bilingual checks remain required.
- Existing dirty scheduling changes and `__qa_shopping.html` were preserved. The Day 3 same-date conflict fixture is specified but not implemented or claimed as passing. Next ready assignment: Day 2 planning engine.

## Day 2 checkpoint — September 22, 2026

- Added `week-planner-logic.js` as a pure, deterministic seven-date dinner-draft engine. It keeps existing dinner plans, preserves explicitly locked draft choices during regeneration, proposes known catalog recipes within verified time limits, and leaves unmet or ambiguous constraints unresolved. A draft contains the normalized effective-day baseline and schedule version for the later approval workflow. It is not yet connected to the app UI or any save path.
- Added eight focused planner tests for date boundaries, existing/locked meals, quick nights, empty catalog and missing ingredients, English/Spanish restrictions, advisory pantry/favorite signals, deterministic output, and input immutability.
- Corrected the existing home-food matching helper so English and Spanish variants are compared separately. A bilingual inventory label now contributes an advisory match instead of being interpreted as one combined phrase. No inventory amount is inferred.
- Advanced the app-shell and service-worker cache versions together to 176. Added the planner module and a previously omitted reachable catalog module to the static pre-cache and its test. A source-graph audit found no remaining uncovered first-party imports or missing listed assets.
- `npm test`: 347 passed, 0 failed. `git diff --check`: passed. The local app at the household gate loaded at 390 and 360 CSS pixels with no horizontal overflow or browser console errors; Spanish gate copy displayed. A full offline reopen and service-worker update cycle were not verified in this browser session. The new planner has no rendered screen yet, so its actual UI/mobile flow remains for Day 3.
- Existing scheduling changes and `__qa_shopping.html` remain untouched. No production data, model calls, deploy, or new persistent fields were involved. Day 3 approval/shopping integration is the next assignment; it must not infer that this standalone module is already usable by families.

Usage journal: Day 1 began with 67% weekly and 44% five-hour remaining; after Day 1, 65% weekly and 36% five-hour remained. Day 2 ended at 64% weekly and 28% five-hour; the latest Day 3 continuation checkpoint ended at 63% weekly and 21% five-hour. These are account-wide snapshots, not exact project attribution. Check both windows again before the next work session.

## Day 3 foundation checkpoint — September 22, 2026

- Added `week-approval-logic.js`, a pure preparation step for explicit date approvals. It compares the full effective day with the draft baseline, blocks any same-date concurrent change, and composes only a new dinner main into a date override. It carries the latest observed schedule version so the eventual PUT can use normal server version checks. It never calls the current `saveSchedule()` auto-merge path.
- Six focused tests cover preservation of breakfast, lunch, sides, notes, and handoff; the two-device same-date lunch conflict; unrelated remote edits; remote dinner/notes edits; invalid/restriction-review choices; and unchanged existing dinners.
- Advanced the static cache/app-shell version pair to 177 and pre-cached the new module. `npm test`: 353 passed, 0 failed. `git diff --check` passed; the listed pre-cache assets exist. The local household gate reloaded at version 177 without browser errors or overflow at 390 CSS pixels. A full offline reopen/update cycle remains unverified.
- This foundation is not connected to the UI or the schedule endpoint yet. The eventual integration must fetch the latest authoritative schedule, prepare the selected dates, PUT the returned record with its version, and on a 409 re-evaluate all target dates against the returned server copy before any retry. No auto local-wins save is allowed. Week preview, keep/swap controls, shopping review, and visible partial-success states remain to be built and browser-tested.
- No persisted field or key changed, and no production write or deployment occurred. Stop at this checkpoint before starting the larger save/shopping integration; check live usage again when resuming.

Day 3 continuation: tracing the actual Plan screen showed that `schedule-ui.js` renders the week inside `#weekPlanningPanel`, while `app.js` owns both the shared schedule save and grocery generation. The existing `saveSchedule()` retries a whole-date local merge on a 409, so draft approval must use a distinct fetch → prepare → PUT path with a bounded recheck on conflict. I added a fail-closed check when another device has moved the active week: weekday schedule slots can no longer be assumed to describe the draft's dates. One regression test covers this case. `npm test`: 354 passed, 0 failed; `git diff --check` passed. The next implementation step is to insert the draft preview into `#weekPlanningPanel`, then wire its explicit approval through that distinct path and test the rendered bilingual phone flow. Shopping remains a separate explicit action after a confirmed plan save.

## Day 3 schedule-approval checkpoint — September 23, 2026

- Added the Plan-screen dinner draft with regenerate, keep/unlock, swap, per-date inclusion, and explicit approval. It uses only published household recipes. Unverified days stay open, and a swap without an alternative restores the original choice.
- Added a separate approval client. It fetches the latest schedule, compares selected dates against the draft baseline, writes one versioned record, and performs at most one recheck after a `409`. A same-date concurrent edit blocks approval; unrelated remote dates survive. It never enters the ordinary whole-date auto-merge retry. Drafts introduce no stored fields or grocery writes.
- `npm test`: 359 passed, 0 failed. `git diff --check` and the changed UI module syntax check passed. A synthetic, localhost-only household verified approval surviving reload before the final UI polish. The final fresh-port check verified English/Spanish draft copy, focus after swap, no horizontal overflow at 390px or 360px, and no browser console errors or warnings. A full offline reopen and service-worker update cycle were not verified.
- Usage at this continuation start: 62% weekly and 100% five-hour remaining; final snapshot: 57% weekly and 68% five-hour remaining (account-wide snapshots, not exact project attribution). No production data, app API credits, reset credit, push, or deployment were used.
- Day 3 remains incomplete: shopping preview/update and the checked-quantity increase rule need design and tests before automatic grocery changes. Future-week approval currently fails closed when navigating away from the saved active week. Next bounded assignment: implement a truthful shopping preview and explicit update path, including checked-item provenance and partial-success/retry states; do not advance to Day 4 yet.

## Day 3 shopping-preview checkpoint — September 23, 2026

- Added a read-only grocery comparison and a Plan-screen preview action after confirmed dinner approval. It reads fresh versioned schedule and grocery records, then compares planned rows for additions, removals, quantity changes, and changed meal uses. Checked changed or removed rows are visibly flagged for review. This step writes no grocery record and changes no persisted schema.
- Three focused grocery tests cover a checked quantity increase, a checked item removed from a plan, and an identical repeat preview. The full suite passed: 362 tests, 0 failures. `git diff --check` and changed-module syntax checks passed.
- In a localhost-only synthetic household, dinner approval led to a five-ingredient shopping preview; Spanish ingredient and action labels rendered. The settled page fit 360px and 390px widths, and the browser console had no errors or warnings. This run did not verify an old-to-new service-worker update cycle or an offline reopen.
- The preview action currently appears only in the session that approved the draft; it is not yet a persistent shopping workflow. The update action is still pending. Existing Shop generation continues to use its previous merge behavior, so the new preview must not be described as having fixed checked-item reconciliation globally. Next assignment: define an explicit, conflict-safe grocery update that preserves checked purchase evidence and reports schedule-saved/groceries-pending outcomes truthfully, then verify reload and two-device conflicts before Day 4.
- Usage for this continuation: started with 49% weekly and 69% five-hour remaining; ended with 47% weekly and 55% five-hour remaining. These are account-wide snapshots, not exact project attribution. No application AI call, reset credit, production write, push, or deployment occurred.

## Day 3 explicit shopping-update checkpoint — September 23, 2026

- Added a separate client for the previewed grocery update. It re-reads the shared schedule and groceries, requires both previewed versions, blocks checked items that would change or disappear, and makes one versioned grocery write without an automatic conflict retry. The Plan screen reports shopping success, pending local edits, stale records, conflicts, and unconfirmed writes separately from the already-saved meal plan. Matching planned rows keep their IDs and creation times; manual rows remain.
- `npm test`: 367 passed, 0 failed. `git diff --check` and changed-module syntax checks passed. A localhost-only synthetic household completed approve → preview → update → Shop → reload; five scaled ingredients remained after reload. English and Spanish Shop states fit settled 360px and 390px viewports, and the browser console showed no errors or warnings.
- No persisted shape changed and no production data was touched. Existing Shop list generation still uses the older rebuild path and may carry a checked state across a changed required quantity; this new guard applies to the Plan preview/update path only. The Plan preview/update entry point also remains session-scoped after approval. Full offline reopen, service-worker update, and live two-device browser checks remain unverified; the two-version conflict behavior has focused tests.
- Usage for this continuation: started with 44% weekly and 36% five-hour remaining; final account-wide snapshot was 41% weekly and 19% five-hour remaining. The rounded five-hour reading crossed the intended 20% reserve by one point during handoff checks, so stop here until the window resets. Next assignment: audit the existing Shop rebuild against checked purchases, then finish any Day 3 gaps before Day 4. No reset credit, application AI call, production write, push, or deployment occurred.

## Day 3 older shopping-path safety checkpoint — September 23, 2026

- The Shop build action and approved school-lunch grocery sync now stop before a local rebuild would change or remove a checked purchase. Lunch approval only starts grocery sync after its shared-state save succeeds, and reports when the lunch saved but shopping still needs review. English and Spanish messages are present. This adds no persisted field or migration.
- `npm test`: 368 passed, 0 failed. `git diff --check` and changed-module syntax checks passed. In a localhost-only synthetic household, Shop refused a build that would erase a checked rice row and retained the checked count. Both languages fit settled 360px and 390px widths without horizontal overflow; the browser console showed no errors or warnings.
- Day 3 core local flow is usable, but the Plan preview remains session-scoped after approval. The older Shop and lunch save paths retain their existing conflict merge, so concurrent shopping edits need the Day 7 two-device check. Full offline reopening and service-worker update remain unverified. No production data, application model call, reset credit, push, or deployment occurred.
- This continuation started at 41% weekly and 100% five-hour remaining after the window reset. The post-verification account-wide snapshot was 39% weekly and 88% five-hour. Stay within the five-point weekly session target and the 25%/20% reserves when starting Day 4.

## Day 4 change-of-plans logic checkpoint — September 23, 2026

- Added a read-only dinner-attendance preview for a specific valid date. It preserves other meal periods, dinner items, notes, and handoff; shows the before/after planned servings and each dinner recipe's before/after batch count; and marks when shopping needs separate review. It does not write schedule or groceries.
- Added a deterministic quick-dinner alternative selector using known prep minutes and real recipe ingredients. It excludes the current dinner, over-time recipes, and blocked recommendations; any explicit restriction leaves the result marked for review. A no-cooking option remains a manual choice. No provider call or new stored data is involved.
- Three focused tests cover attendance changes across a month boundary, nonmutation and preserved meal fields, invalid input, and conservative quick alternatives. `npm test`: 371 passed, 0 failed. `git diff --check` passed.
- A bilingual, mobile Today disclosure now exposes both read-only previews and a clear action to edit dinner in the existing Plan screen. Preview input is deliberately excluded from shared dirty-form tracking. Switching languages clears the prior preview and rerenders the screen. The 360px and 390px local browser checks found no horizontal overflow; English and Spanish preview copy rendered. The local static server cannot serve shared-data functions, so expected connection warnings appeared in the console. An old-to-new service-worker update was observed, but offline reopening and a complete API-backed journey remain unverified.
- This does not complete Day 4: the Today control does not directly apply a selected suggestion or attendance, ingredient-level grocery contributions are not yet shown, and conflict-aware apply/undo is not implemented. The next assignment is to add the fresh-record save path and a precise review of affected meal items and grocery contributions, with cancel/no-mutation, conflict, and browser tests. Keep grocery reconciliation a separate explicit action.
- After the Today UI changes, `npm test`: 371 passed, 0 failed; changed-module syntax checks and `git diff --check` passed. Handoff account-wide snapshot: 37% weekly and 77% five-hour remaining. Session began at 41% weekly after the five-hour reset; rounded weekly use remains under the five-point session target. No production write, app AI call, reset credit, push, or deployment occurred.

## Day 4 attendance save and undo checkpoint — September 24, 2026

- Today can now save a dinner attendance adjustment after preview. A separate client re-reads the versioned schedule, compares the target date with the preview, writes one date override, and stops on a same-date change, moved active week, or `409`. Undo is an immediate second versioned change anchored to the server-returned saved meal; it never restores an entire old household snapshot. Shopping stays unchanged and is described separately. A quick-recipe replacement is still preview-only and opens the existing Plan editor.
- Focused tests cover preservation of another date, breakfast/lunch/notes, invalid conflicts, a single-write version conflict, and undo after a server-shaped meal response. In a localhost-only synthetic schedule fixture, Spanish Today showed a 5→6 serving preview, saved it, offered Undo, restored the prior attendance, and showed the restored guest count after reload. The final preview and Save control fit 360px; the Today view fit 360px and 390px without horizontal overflow. This fixture is not a production endpoint and did not exercise Netlify Blobs. Background rerenders initially removed preview/Undo; the UI now keeps them while the exact meal baseline remains current and invalidates them on relevant edits or language changes.
- No persisted shape, household key, or production record changed. Ingredient-level grocery contributions, direct quick-recipe replacement, move-to-later-slot rules, offline save behavior, and a live two-device browser conflict scenario remain to be implemented or verified before Day 4 acceptance. Do not advance to Day 5 while those core gates remain open.
- Final verification: `npm test` passed 375 tests, `git diff --check` passed, and changed-module syntax checks passed. Session allowance started at 29% weekly and 44% five-hour remaining; the final account-wide snapshot was 26% weekly and 27% five-hour. Stop here to protect the 25%/20% reserves. No reset credit, application AI call, production write, push, or deployment occurred.

## Day 4 ingredient-preview checkpoint — September 24, 2026

- The attendance preview now lists each dinner recipe's before/after ingredient text for the exact date, using the same parsing and scaling helpers as grocery generation. Unquantified ingredients are labeled as unspecified, and a missing recipe is labeled unavailable; the preview still distinguishes per-recipe contributions from the actual shared shopping list. A focused regression test checks the scaled ingredient amounts.
- `npm test`: 375 passed, 0 failed. Changed-module syntax and `git diff --check` passed. In a localhost synthetic household with a deliberately missing recipe, Spanish Today showed the date, an unavailable-ingredient message, and a separate shopping-review instruction. The missing-recipe label was corrected after that browser observation; the final label change passed tests but was not browser-rechecked. A browser fixture with known recipe ingredients and a full two-device conflict remains pending.
- The weekly allowance reset at approximately 11:06 a.m. Eastern today; its next reset is October 1, not tomorrow. The current five-hour window resets around noon Eastern. The last usage snapshot was 99% weekly and 19% five-hour remaining, one point below the planned 20% five-hour reserve due to rounded reporting. Stop feature work until that window resets. No reset credit, application AI call, production write, push, or deployment occurred.

## Readiness evidence — September 22, 2026

Luna completed the initial read-only review. `npm test` passed: 339 tests, 0 failures, against the current working tree including the existing scheduling changes. `git diff --check` passed for tracked changes. This is a baseline, not verification of the proposed features.

The review identified same-date local-wins schedule reconciliation and an overly broad Day 1 prototype assignment. Both are addressed explicitly above. Existing dirty files were preserved. Next executable assignment: Day 1 only; no feature implementation or deployment has occurred under this plan.

## Day 4 quick-dinner swap checkpoint — September 25, 2026

- Today now offers a direct, reviewed replacement when a known recipe fits a shorter time limit. The preview names the exact date and old/new dinner recipes and shows each main recipe's scaled ingredient contribution. Recipes needing restriction review stay in manual Plan editing; an empty dinner directs the family to plan it first. The save changes only the existing dinner main's recipe ID in a date override, retaining its item ID, other meal periods, sides, attendance, notes, and other dates. Groceries are not changed automatically. Immediate Undo repeats a fresh-record date check and restores only the prior recipe.
- The new save client reads the latest schedule and performs one versioned write. A changed target date, moved active week, or `409` requires review instead of overwriting or automatically retrying. The implementation adds no stored field, key, migration, model call, or production write. A narrow-header overflow found during testing was fixed; the changed preview button now has a 44px tap height. The app-shell/service-worker version pair is 195, with the stylesheet URL advanced to 148.
- `npm test`: 378 passed, 0 failed. `git diff --check` and changed-module syntax checks passed. A synthetic localhost schedule/catalog fixture in the browser showed Spanish preview → save → Undo → reload, with the original dinner restored. A separate two-tab fixture saved a guest-count change in one tab, then blocked the other tab's stale recipe-swap preview; reload retained the guest count and original dinner. English preview at 390px and 360px and Spanish at 390px rendered; the settled 360px page had no horizontal overflow, the save control measured 44px, and checked browser error logs were empty. A local service-worker update was activated, and the static app reopened with the fixture server stopped. Offline save showed a pending message and made no confirmed change.
- These are synthetic browser fixtures, not a Netlify Blob or physical-device check. The current UX replaces tonight's dinner; it does not offer a move to a later slot, so occupied-slot movement rules remain out of scope. A complete Day 7 end-to-end journey, real endpoint/browser conflict and PWA checks, and the Day 5 memory work remain. Do not deploy yet. This session started with 91% weekly and 53% five-hour remaining and ended with 88% weekly and 30% five-hour remaining (account-wide rounded snapshots). No reset credit, application API spend, production data, push, or deployment occurred.

## Local integration checkpoint — September 25, 2026

- Preserved the earlier week-one work on `codex/week-one-overhaul` and replayed its feature commit onto a new local branch, `codex/week-one-overhaul-current`, based on `origin/main` at `bf7bf78`. The older branch remains available as a recovery snapshot. The remote had advanced to app-shell version 203, so the integrated shell and service-worker cache now use 204.
- Combined the current Today dinner chooser, Plan save bar, Family Help, and updated mobile styling with the week draft, shopping review, and change-of-plans paths. The existing checked-grocery evidence guard remains alongside the new purchase-review preview. Preserved the unrelated untracked `__qa_shopping.html`.
- `npm test`: 620 passed, 0 failed. `git diff --check` and changed JavaScript syntax checks passed. The local browser loaded the household gate in English at 390px and Spanish at 360px without horizontal overflow or console warnings/errors. The gate prevented an authenticated end-to-end app journey; the full draft/Today flow, an offline reopen, and a service-worker update cycle have **not** been reverified on this integrated branch.
- No production data, application API credits, reset credit, push, or deployment were used. Before release, finish the old-branch-vs-current-main behavior audit, exercise the integrated flows with controlled household responses, and run the repository's release gates. The feature integration is a local checkpoint, not deployment approval.

## Deployed slice and Day 5 draft-recovery checkpoint — September 25, 2026

- At the user's explicit request, the reviewed `b7f6881` integration was pushed to GitHub `main` and Netlify. Production `index.html`, `app.js`, and `service-worker.js` matched the release checksums. The live browser updated from an older cached shell to version 204 on reload; one existing-session shared-state conflict warning appeared and did not repeat. This was a release of the current slice, not completion of Days 5–7.
- New local work on the next branch revision adds bounded, household-scoped recovery for an unfinished weekly dinner draft. A restored draft retains kept choices and selected dates but still requires explicit approval. Changed week, recipe/planning context, schedule version, or effective meal baseline produces a review message and disables approval until a new draft is generated. No shared record shape or application model call changes.
- A conservative dinner-memory correction now counts only cooked dinner events for repeat spacing and outcome ranking, caps recent-event scoring at the latest five cooked events, uses recorded attendee reactions only when present, and suppresses legacy aggregate feedback when a matching event exists. The Today memory sentence distinguishes disliked from liked reactions and uses correct singular/plural English and Spanish copy. No stored field or key changes.
- `npm test`: 629 passed, 0 failed. `git diff --check` and changed-module syntax checks passed. A localhost-only synthetic household recovered kept choices and selected dates after reload; the Spanish 360px draft fit without horizontal overflow. Another synthetic browser fixture checked English/Spanish memory copy, a service-worker update from deployed version 204 to local version 206, and offline reopening. These fixtures did not exercise production Netlify Blobs or a physical phone.
- This is a local Day 5 checkpoint; the transparent memory surface, direct correction of source records, and remaining five-experience acceptance fixtures are still pending. No application AI call, reset credit, production write, push, or deployment occurred. This continuation started with 82% weekly and 70% five-hour remaining; the final account-wide snapshot was 79% weekly and 48% five-hour remaining. No push or deployment is authorized by this continuation alone.

## Day 5 family-memory correction checkpoint — September 26, 2026

- Family now separates member-stated preferences from dated observations of cooked dinners. Each observation links to its existing dinner record; a past-dinner form corrects outcome and recorded attendee reactions without creating another memory store. Member preference summaries link to their existing edit forms. Takeout and skipped dinners remain labeled as such rather than becoming cooked observations.
- A historical correction reads the latest versioned dinner history, compares the source event by date, and writes once only when the event is unchanged. A changed event or `409` asks for review; offline failure keeps the form values. The correction keeps the event ID, recipes, leftovers, note, and household scope. No record shape, key, migration, provider call, or production write changed.
- The Today attendance controls already prefill adults, children, and guests from the current dinner and leave the open form alone during background renders; the weekly draft keeps its in-progress selection and blocks stale approval. This is a code-path audit, not yet the full Day 7 slow-refresh browser fixture.
- Focused correction tests and the full Node suite passed (634 tests, 0 failures). `git diff --check`, changed-module syntax, and the service-worker module/cache-version tests passed. A localhost-only synthetic household corrected a reaction in English desktop and Spanish 360px, retained it after reload, blocked a stale correction without a second write, and loaded the newer record. Both layouts had no horizontal overflow or browser console errors. A separate local PWA fixture updated the worker from 206 to 207 and reopened the static app shell offline at 360px without page errors or overflow. A physical device, live Netlify Blob conflict, and Day 7 full journey remain unverified.
- App-shell and service-worker versions are paired at 207. This is a local checkpoint only; no push or deployment is authorized by this continuation. The next bounded assignment is the remaining Day 5/Day 6 reliability fixtures, especially active-edit refresh, slow or failed saves, and source-correction offline review.
- Account-wide usage for this continuation started at 100% weekly and 100% five-hour remaining and ended at 97% weekly and 83% five-hour remaining. The weekly change stayed within the five-point session target and above the 25%/20% reserves. No reset credit, application API credit, production write, push, or deployment was used.

## Day 6 first-load clarity checkpoint — September 27, 2026

- Added static meal, grocery, and recipe outlines while an uncached household is waiting for its first shared response. Cached records display immediately. A failed first load replaces the outlines with the existing error and retry state; it does not present a premature empty list or retry button while a request is still in flight. The outlines announce one localized loading message and use no animation or repeated requests. English and Spanish remain in parity.
- The app-shell and service-worker cache versions are paired at 208. No stored record, household key, endpoint, or application AI flow changed. The unrelated untracked `__qa_shopping.html` remains untouched.
- Focused loading/PWA tests passed. The full Node suite passed: 636 tests, 0 failures. `git diff --check` and changed JavaScript syntax checks passed. One pre-existing inventory test had a fixed “fresh” expiration date that entered the three-day “use soon” window on September 27; its fixture now computes a date 14 days ahead.
- A localhost-only synthetic household verified delayed first responses, settled content, cached reloads, and failed-response recovery in English and Spanish at 360px and Spanish desktop. There was no horizontal overflow or page error. A local service-worker update from 207 to 208 and offline shell reopening at 360px passed. These checks did not exercise production Netlify Blobs or a physical phone.
- This is a local checkpoint, not a release. Day 6 still needs slow or failed save recovery and active-edit preservation fixtures. Account-wide usage started at 97% weekly and 80% five-hour remaining; the last snapshot was 92% weekly and 50% five-hour remaining. Stop at the five-point weekly session target. No reset credit, application API credit, production write, push, or deployment was used.

## Day 6 dinner-correction save checkpoint — September 27, 2026

- The Family past-dinner correction now announces a localized saving state immediately, disables that form while the request is in flight, and submits a fixed copy of the selected outcome and reactions. A background render keeps the form disabled and its selections intact. A failed save leaves the correction editable and returns focus to its outcome field; a successful save returns focus to the correction button. Repeated submit attempts cannot create another in-flight write.
- A focused UI regression test covers slow-save feedback, stable submitted values, background rendering, duplicate submission, and failed-save recovery. The full Node suite passed: 637 tests, 0 failures. The app-shell and service-worker versions are paired at 209; no new frontend module or stored field was added.
- A local synthetic household browser fixture at 360px verified English and Spanish pending/failure copy, one controlled failed PUT, preserved selection after a refresh, and focus return. Neither run logged a page error. Spanish had no horizontal overflow. English measured a two-pixel horizontal document scroll after focus returned; this minor mobile layout issue remains for the Day 7 visual pass. The same fixture verified a local service-worker 208→209 update and static shell reopening offline. It did not exercise a physical phone or production Netlify Blobs.
- This checkpoint covers the historical correction flow only. Other high-use saves and the full Day 7 journey still need slow/offline/conflict acceptance fixtures. Account-wide usage started at 83% weekly and 43% five-hour remaining; the last snapshot was 82% weekly and 37% five-hour remaining. No production write, application API call, reset credit, push, or deployment occurred.

## Day 6 Plan-save truth checkpoint — September 27, 2026

- A delayed Plan save already showed an immediate saving state, and a controlled server failure kept the edit in the household-scoped pending key. On reload, the synthetic household restored the note and retried the shared write without claiming success before the response. A new regression test covers the saving → pending → explicit retry → saved presentation.
- The audit found a narrower trust gap: if browser storage rejected the pending-copy write, the same failure message still claimed the edit was saved on this phone. The Plan bar and per-meal status now use a localized warning to keep the page open and retry, because a reload may lose that in-memory edit. No record shape, key, endpoint, or conflict policy changed.
- Local synthetic browser runs verified normal failed-save recovery in English at 360px and Spanish at 390px; a blocked pending-copy write produced the distinct warning in both languages. No Plan run had horizontal overflow or page errors. These were controlled local responses, not production Blobs or physical devices. A new focused UI test covers the no-local-copy message. `npm test`: 639 passed, 0 failed. Changed JavaScript syntax and `git diff --check` passed. A separate local service-worker fixture activated version 210 from 209 and reopened the static shell offline at 360px; the pre-existing two-pixel Family focus scroll observed in the prior checkpoint remained.
- Account-wide usage began this continuation at 81% weekly and 100% five-hour remaining; the last snapshot was 79% weekly and 88% five-hour remaining. Stop at this bounded save checkpoint. No application AI call, reset credit, production write, push, or deployment occurred. Day 6 still needs other high-use save/error fixtures before Day 7 release review.

## Day 6 Shop in-flight truth checkpoint — September 27, 2026

- Shop's versioned save coordinator already preserved checked changes through a failed shared write and offered a finite Retry path. Its in-flight status, however, claimed local safety even when the pending journal and cached list both failed to write. The coordinator now passes the capture error to Shop, which shows a localized keep-open warning while the one shared request is in flight. The existing storage-specific failure, successful-cloud-without-backup, timeout, conflict, and retry paths are unchanged.
- A focused coordinator regression check verifies that the storage error is available at save start. `npm test`: 639 passed, 0 failed; changed JavaScript syntax and `git diff --check` passed. The app-shell/service-worker version pair is 211; the first-party module graph is unchanged.
- In local synthetic households, a delayed grocery PUT followed by a controlled `503` kept Milk checked and exposed Retry. At 360px English and 390px Spanish, blocked browser storage produced the distinct in-flight warning and the existing storage failure message; the ordinary English path used its normal sync message. Those Shop runs had no document overflow or page errors. A local 210→211 service-worker update activated and the static shell reopened offline at 360px. The separate Family focus fixture still measured its previously recorded two-pixel horizontal scroll.
- This was synthetic browser data, not a production Blob or physical-device check. The older Shop rebuild still needs a Day 7 two-device conflict run. Account-wide usage began this continuation at 79% weekly and 86% five-hour remaining; the last snapshot was 78% weekly and 79% five-hour remaining. No stored field or key, household access, model call, production write, reset credit, push, or deployment changed.

## Day 7 two-device Shop conflict checkpoint — September 27, 2026

- Separate synthetic browser profiles started from grocery version 1. Ordinary checks merged correctly: one shopper checked Milk, the other checked Bread from an older view, the second write received `409`, and one retry saved both checked rows at version 3. English 360px and Spanish 390px had no page errors or overflow.
- The older Shop rebuild exposed a release blocker: after Milk was checked on one device, a stale build on the other removed it with an automatic retry. The initial `409` had the latest checked Milk, but the generic grocery merge replayed the rebuild's deletion. The planned-rebuild save mode now stops at that conflict, restores the latest shared list, clears the stale deletion journal, and shows a localized review message. Approved-lunch grocery rebuilding uses the same mode. Ordinary checkbox edits keep their existing merge behavior. The Shopping-built activity is recorded only after a confirmed grocery save.
- Repeating the two-device rebuild fixture showed one rejected stale PUT and no second write. Milk remained checked on both devices after reload, the stale journal was absent, and Retry was hidden until a person chooses to rebuild again. When browser storage blocks journal cleanup, the app instead offers a local-only Retry and warns the person to keep the page open; the focused test confirms this retry makes no shared write.
- `npm test`: 641 passed, 0 failed. `git diff --check` passed. A local service-worker update from 211 to 212 activated, and the static shell reopened offline at 360px. The existing Family focus check still measured a two-pixel horizontal scroll. These browser runs used controlled local endpoints, not production Netlify Blobs or a physical phone. The two-device fixture invoked the Shop build button programmatically after its setup panel was rerendered; the production click handler and save path still ran. A full authenticated Day 7 journey and live endpoint checks remain open before release.
- No stored record shape, key, migration, household access rule, application AI call, or production data changed. Account-wide usage began this continuation at 77% weekly and 77% five-hour remaining; the last snapshot was 74% weekly and 56% five-hour remaining, within the five-point weekly target and above the 25%/20% reserves. No reset credit, push, or deployment occurred.

## Day 7 Plan-to-Shop integration checkpoint — September 28, 2026

- `npm run check:fresh-main` initially found this task's local branch ahead of live `origin/main`. After fetching, a fresh isolated checkout passed the check at `b7f6881`; the seven local overhaul commits were a direct descendant with no competing main commits. Continued on `codex/day7-acceptance` without altering the original checkout or its unrelated untracked file.
- A controlled browser journey found a release blocker after approving a weekly dinner draft: “Preview shopping changes” referenced the removed `groceriesDirty` variable and showed a misleading connection error. The explicit shopping update also contained two removed storage/pending identifiers. The callbacks now consult the current grocery journal/coordinator, and a confirmed shopping write uses the coordinator's acknowledged local snapshot and existing cleanup status. No server record or local-storage key changed.
- `scripts/week-draft-browser-harness.mjs` reproduces draft → keep/swap → reload restored draft → approve → preview → shopping update → change tonight's attendance → record dinner feedback → inspect Family memory → reject a stale recovered draft after a controlled shared-version change. English 360px and Spanish 390px each made one initial schedule write, one grocery write for three ingredient rows, one later attendance write, and one dinner-history write. Attendance did not silently rebuild shopping. Both runs showed confirmed results, zero horizontal overflow, and no page errors. This is a controlled local endpoint, not production Netlify Blobs. The fixture does not yet assert that a later recommendation changes after feedback.
- `npm test`: 641 passed, 0 failed. `git diff --check` and changed JavaScript syntax checks passed. App-shell and service-worker versions are paired at 213. A local 212→213 worker update activated and reopened the static shell offline at 360px without page errors; the existing Family focus fixture still measured two pixels of horizontal document scroll. A physical phone, desktop journey, live Blob conflict, full loading/error/focus audit, and release-readiness decision remain open.
- No production data, application API credits, reset credit, push, or deployment was used. The account-wide allowance was 66% weekly and 99% five-hour remaining near the start; the latest snapshot is 63% weekly and 81% five-hour remaining, within the five-point weekly session target and above the 25%/20% reserves.

## Day 7 visual and release-review checkpoint — September 28, 2026

- The controlled draft-to-Family browser journey now covers English at 360px, Spanish at 390px, and English desktop at 1280px. It deliberately fails the first shopping preview with a `503`, verifies a localized retry, then confirms shopping update, attendance save, dinner feedback, Family memory, restored-draft review, stale-draft rejection, focus return, and practical 44px week-draft controls. It made zero AI requests. All three runs had no page errors or document overflow; the only console resource error was the deliberate `503`.
- A separate English/Spanish 360px dinner-correction fixture exposed a Family header overflow and a larger overflow when the household menu opened in Spanish. The mobile menu now allows its title and sync actions to wrap within the viewport. After the fix, both languages measured a 360px document and open menu at a 360px viewport. The same fixture confirmed an in-flight save keeps its value, a controlled failed save retains that value and returns focus, and the version 213→214 service-worker update reopens the static shell offline. The app shell, cache, and cache-version test now agree on version 214; no first-party module was added.
- Synthetic screenshots are under ignored `test-artifacts/day7/`, including `en-360-plan.png`, `es-390-plan.png`, `en-360-family.png`, and `en-1280-family.png`. They contain no real household data. The English mobile Family screen and Spanish expanded household menu were visually inspected.
- `npm test`: 641 passed, 0 failed. The browser journey passed all three viewports. `git diff --check` passed. The branch is local and remains a direct descendant of live `origin/main` at `b7f6881`; no production data, application API credits, reset credit, push, or deployment was used. The account-wide allowance at handoff was 59% weekly and 58% five-hour remaining, above the 25%/20% reserves. Rounded weekly use during this continuation was four points.
- **Release decision: NOT READY TO DEPLOY.** The core Day 7 gate is still incomplete: the journey observes Family memory but does not verify that later suggestions change appropriately; first-load skeleton versus cache-hit behavior, known-value prefills, the full empty/loading/error audit, readable contrast, and complete keyboard flow remain unverified. Existing focused fixtures cover selected slow saves, recovery, and two-device grocery conflicts, but this integrated branch has not had a live Netlify Blob/household-isolation check or a physical phone pass. These are verification gaps, not observed production failures. Do not add a provider-powered planning action until the deterministic gates pass.
- Release/rollback path when those gates pass: review the final diff and run the repository pre-deploy gate, commit only intended files, push the approved commit to `main`, verify Netlify production and a private test household, and revert that release commit if a regression appears. Preserve household records and local recovery data; do not delete or rewrite Blob records as rollback. Deployment still requires a separate explicit request.

## Week-one controlled-preview acceptance — September 28, 2026

- Refreshed `.impeccable/design.json` from the approved `DESIGN.md` and actual navy/sage CSS tokens. `DESIGN.md` itself remains authoritative and was not replaced. The sidecar now describes the current palette, type, overlays, navigation, browse card, and meal rows instead of the older herb/limestone concept.
- Extended the local browser journey to hold the initial schedule, grocery, and recipe reads. With no usable cache, Today and Plan show meal-shaped loading outlines, Shop shows three rows, and Library shows four recipe-card outlines; the real content replaces them after the controlled reads settle. After an approved plan and shopping update have local copies, a held-read reload shows no loading outlines. The English mobile, Spanish mobile with reduced motion, and English desktop runs all passed. Draft generation worked through keyboard Enter, and Today's attendance controls matched the saved dinner's adults, children, and guests before editing.
- After recording dinner feedback, the fixture opens tomorrow as a later planning decision and confirms a recipe suggestion in English and Spanish with zero provider calls. The neutral suggestion reason had falsely said it matched shared preferences when none existed; it now says only that the known recipe is an option for an open dinner. The static app/cache version is 215. A local 214→215 worker update activated and reopened the static shell offline at 360px.
- The focused household-isolation suite passed all eight checks, including server validation before storage and household-scoped browser fallbacks. The existing memory tests prove that a correction reverses ranking influence, restrictions still block, and takeout/missing feedback do not imply dislike. The opt-in [pilot measurement sheet](WEEK_ONE_PILOT_MEASUREMENT.md) records self-reported planning time, accepted/changed draft choices, feedback, and measured or unknown provider usage without adding analytics calls or storing family secrets.
- Color pairs used for primary actions and quiet labels were checked from the current tokens: navy on white 11.64:1, navy on warm ground 10.34:1, muted on ground 4.59:1, navy on soft blue 7.10:1, and white on navy 11.64:1. This is a token-pair check, not a complete audit of every rendered element. Browser runs had no horizontal overflow or page errors; the sole console resource error was the deliberately failed shopping read.
- **Plan status:** the required deterministic week-one slice and its five experience requirements now pass controlled local/synthetic acceptance. The optional natural-language AI action remains intentionally deferred under the plan's cut line; no application API credits were spent. This does not authorize or imply deployment. **Production release status remains NOT READY TO DEPLOY** until the final current-diff/configuration review and a release-specific live household verification are completed. No physical-phone pass or production Netlify Blob write was performed in this worktree; those limits must remain visible to the release reviewer.

## Production release and public smoke check — September 28, 2026

- The product owner explicitly requested deployment. The release gate passed with 641 automated tests, zero whitespace errors, English 360px/Spanish 390px/English desktop synthetic end-to-end browser journeys, two-device grocery edit and rebuild conflict runs, a 214→215 service-worker update with offline static-shell reopen, and household-isolation tests. No server function, Netlify configuration, stored Blob shape, or required environment variable changed. The local release commit `4343ece` fast-forwarded GitHub `main` from `b7f6881` and triggered the established Netlify deployment.
- Production served version 215 from both `index.html` and `service-worker.js`. Exact SHA-256 comparisons matched the committed `index.html`, service worker, `app.js`, stylesheet, translations, and weekly-draft UI module. Public browser checks showed the household gate at 360px, 390px, and 1280px with no horizontal overflow, page errors, or failed requests; a later 360px Spanish switch also fit and localized. Unauthenticated schedule and grocery reads returned `401` with `no-store`.
- Rapid repeated synthetic production loads from one IP briefly hit the existing `netlify.toml` 180-request/60-second cap and returned `429`. One read after the window reset returned version 215 with `200`, and a single Spanish mobile browser pass succeeded. This was a verification traffic limit, not evidence of an application loop; avoid repeated full-page production sweeps within one minute. No production household key, private data, application AI call, reset credit, or production write was used.
- Verification limit: the public smoke check cannot prove a private household's Blob write, sync between real devices, installed iOS/Android PWA behavior, or physical-phone interaction. The controlled fixtures cover those code paths where feasible; collect a consented private-household/physical-device pass after release before claiming those environments were observed. If a release regression appears, revert the release commit through Git and verify the prior static shell; do not delete or rewrite household Blob records.
