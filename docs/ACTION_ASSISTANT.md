# Family Help conversation

Family Help is a household-aware conversation inside the existing Help sheet on Today and Plan. It is not a bottom-navigation tab and does not replace the direct planning, shopping, recipe, inventory, lunch, or budget workflows.

## What it can answer

Family Help can search and explain the currently available household food information across planned breakfast/lunch/dinner meals and servings, canonical recipe ingredients/steps, shopping and saved lists, At Home inventory, available food, school lunches, preferences/rules, dinner history/handoff, and complete current-month budget/receipt summaries. It keeps a short in-memory conversation through navigation and reopening, and places source cards below every grounded answer.

Answers distinguish evidence carefully. A recipe ingredient means the recipe calls for it. A grocery row shows planned-list or checked-shopping state. Neither proves an ingredient was bought, added, served, or cooked unless the relevant history records it. Missing, stale, conflicting, or ambiguous records are described as such rather than filled in.

## Boundaries and privacy

The browser sends a bounded, relevance-filtered context pack to the authenticated assistant function. It does not send the household key, receipt payment details, raw storage records, or another household’s data. The function uses the configured Responses model with `store: false`; neither the browser nor Netlify persists a conversation transcript.

Record text is treated as untrusted data. The model can return only cited source IDs and one allowlisted action. Browser code verifies the response against the exact context it sent, creates source/action cards itself, and ignores malformed or forged responses.

## Actions

Source cards can open the corresponding existing meal, recipe, Shop/At Home, School Lunches, or budget screen. Family Help can also begin these familiar, typed flows:

- **Preview dinner ideas:** reuses the existing empty-dinner proposal and never overwrites an occupied dinner.
- **Preview shopping refresh:** reuses the existing date selection, exact changes, manual-row preservation, freshness check, and grocery save path.
- **One-item proposals:** add or edit a grocery row (including its checked state), add or replace a cited recipe for a resolved meal date/period, add or update a cited At Home item, or record actual leftovers. Every argument is validated against the exact source IDs and dates supplied for that answer, then previewed and explicitly applied through the existing save coordinators. Exact-item meal moves—including duplicate recipes and leftover-linked entries—stay in the normal meal editor because chat cannot safely infer the item ID.

Meal serving-count proposals are deliberately offered only when the existing meal has no child or guest split. In mixed serving plans, Family Help opens the meal editor instead of silently flattening that household-specific breakdown.

Those actions still require an exact preview followed by **Apply** / **Aplicar**. The model never saves a plan, shopping list, inventory item, leftover, preference, recipe, lunch, receipt, or budget change directly. Other domains currently receive a genuine deep link to their existing editor; they are not presented as completed chat actions.

## Reliability and limits

Each submit makes at most one foreground provider request with a browser 15-second timeout, server 14-second timeout, bounded input/history/output, and abort/generation protection against a stale response. There is no polling, automatic retry, or background prompt. The current per-household/per-route daily usage guard is 30 calls; its in-memory serialization reduces races inside one function instance but is not a distributed hard spending cap. If Family Help is offline, unavailable, out of quota, or returns invalid structured output, it explains the failure and leaves the normal app controls available.

`npm run eval:assistant-model` is an opt-in, synthetic-data contract check. It makes no calls without `OPENAI_API_KEY`, never reads a household, and permits one to three calls only (`FAMILY_ASSISTANT_EVAL_MAX_CALLS`, default 2). It checks that the configured model returns the strict Family Help response function; it is not a substitute for a production household test.
