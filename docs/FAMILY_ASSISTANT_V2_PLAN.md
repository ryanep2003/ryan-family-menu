# Family assistant v2 plan

## Outcome

Replace the action-sheet keyword fallback with a bounded, household-aware conversation that can answer questions about the family’s food information, cite the records it used, and offer only real app actions. It remains an overlay opened from Today and Plan; it does not create a navigation tab, persist a chat transcript, or replace any manual workflow.

## Capability inventory

| Domain | Grounded read/search | Connected action |
| --- | --- | --- |
| Plan: breakfast, lunch, dinner, servings, handoff | Search dates, periods, servings, notes, and linked recipes; resolve relative dates against the viewed week | Open the exact meal; add or replace a meal for a resolved date/period and record actual leftovers through an exact preview and confirmation. Moving a specific duplicate/leftover-linked item stays in the editor. |
| Recipes | Search name, ingredients, notes, and category | Open the exact recipe or Library search |
| Shopping and saved lists | Search list rows, meal provenance, quantities, check state, and inventory advice | Open Shop; add or edit one named grocery row (including check state), or rebuild only the exact resolved dates through preview/confirmation |
| At Home inventory and available food | Search names, localized quantity, location, stock, expiration, and availability | Open At Home; add an item or update a cited item’s stock/amount through preview/confirmation |
| Leftovers, dinner history, handoff | Explain recorded leftovers, outcomes, and preparation notes | Open the associated planned meal; do not represent planned leftovers as actually cooked |
| School lunches | Search approved plans and their grocery contribution | Open School Lunches; existing builder remains the safe editor |
| Preferences and household rules | Surface recorded constraints as evidence | Open the household/family editor; never alter restrictions from model output |
| Receipts and budget | Summarize recorded receipt totals and current monthly target only | Open the budget/receipt flow; do not send payment details to the assistant model |

The implementation provides typed, deterministic adapters for opening a cited source, filling empty dinners, refreshing an exact selected shopping window, adding/editing one grocery row, adding/updating one inventory row, adding/replacing one resolved meal, and recording actual leftovers. Preferences, recipes, lunches, receipts, budgets, account controls, destructive operations, and exact-item meal moves remain in their existing editors; the assistant must open those screens rather than imply it made the change.

## Architecture

1. The browser builds a small, sanitized context pack from the currently loaded household state. It uses canonical normalizer shapes (including language-keyed recipe lines), ranks prior-turn references and query matches before generic linked records, always retains hard restrictions, supplies today/viewed/resolved dates and coverage state, caps every domain, omits household keys and receipt payment information, and treats all recipe/record text as untrusted data.
2. `/.netlify/functions/assistant` validates the household key before any configuration/provider work, bounds request/history/context bytes and output tokens, uses the existing configured Responses model and per-household/per-route daily usage guard, and sends `store: false`.
3. The model may request one of a small set of typed read views or return a structured answer with source IDs and an allowlisted action proposal. It cannot receive arbitrary code, URLs, record keys, household IDs, or raw replacement state.
4. Browser code validates every proposal’s type, source ownership, IDs, arguments, and resolved dates against the context pack, renders source cards from local authoritative records, and turns it into a bounded preview. Any write is an exact preview followed by an explicit confirmation through the existing conflict-aware save function. It expires if the referenced plan/list/inventory state changes.
5. The open-sheet transcript is bounded in memory, remains available when navigating to a citation or reopening Help, and is cleared only by New conversation, household exit/lock, or reload. Request generation plus abort protection prevent an older response from being appended after close, reset, or household change. It is never stored in a new browser or Blob record. AI outages, offline state, malformed replies, and quota exhaustion preserve normal controls and show a concise recovery message.

## Operating limits and quality bar

- One foreground request per submitted message; no polling, background calls, or automatic retries.
- Bounded prompt/history/context, a small number of tool rounds, and a bounded provider timeout/output. The existing 30/day route limit is serialized only inside a function instance; it is not a distributed hard spending cap.
- English and Spanish share the same response/action contract and interface keys.
- Automated coverage uses controlled fixtures for the basil question, ambiguous dates, cross-domain references, zero matches, hostile record text, malformed output, stale confirmations, offline/quota/failure states, and concurrent changes. A real-model quality pass is separately reported only when a nonprivate authorized integration is available.

## Implementation stages

1. Add pure, bounded retrieval/context and response-validation modules with a cross-domain test matrix.
2. Add the authenticated, bounded assistant function using the existing Responses integration and a strict structured response schema.
3. Replace the sheet’s typed-query fallback with conversation rendering, source cards, and typed navigation/action adapters while retaining current preview flows.
4. Add bilingual strings, mobile/focus/error behavior, service-worker graph updates, and documentation that supersedes Phase B lite.
5. Verify fixtures, endpoint access/sanitization, stale writes, browser mobile layout, and the full test suite. Do not deploy from this task.
