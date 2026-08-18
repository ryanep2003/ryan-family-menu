# Ryan Family Menu: Code Review

**Date:** 2026-08-17
**Scope:** Full repository (120 files, ~27k lines, 17 Netlify Functions, 45 test files), plus a read-only check of the live gate at ryanfamilymenu.netlify.app.
**Review priorities, in order:** usability (can a family use this without a ton of manual work), data safety, correctness, cost, maintainability.
**Not run:** `npm test`. This review was performed against a source export with no working tree, so no claim is made about the current suite.

Findings are numbered `H*` (high), `M*` (medium), `L*` (low). Line numbers refer to the reviewed sources; verify with a fresh grep before editing, and prefer the named symbol over the line number where they disagree.

---

## Ground rules for anyone acting on this

Read `AGENTS.md` first. These fixes must respect the existing invariants:

- Do not change Blob store names, record keys, version envelopes, local-storage keys, IDs, or field meanings without an explicit migration.
- Preserve legacy meal fields and compatibility normalization.
- Any persisted-field change must update browser normalization, server sanitization, local persistence, tests, and docs together.
- Keep English and Spanish translation keys at parity.
- If a frontend module is added or removed, update the service-worker pre-cache list and the cache version.
- Do not introduce polling, rapid retries, or broad asset pre-caching.
- Run `npm test` and `git diff --check` before committing. Do not claim a check passed unless it was actually run.

Suggested sequencing: do H2 and H3 together (same root cause), then H1, then M1 and M2, then H4, H5, H6. Each is independently shippable.

---

## Fix these six first

Ordered by damage per day of use, not by difficulty.

1. **H2 / H3** Stop version conflicts from discarding whatever the other person just did.
2. **H1** Let a saved family key open the app with no signal.
3. **M1 / M2** Stop background syncs from wiping in-progress typing, and fix the dead "Remove receipt" button.
4. **H4** Make recipe yield real, so scaling, batches, and leftovers stop silently doing nothing.
5. **H5** Show the English name instead of "Translation pending" in Spanish.
6. **H6** Stop writing a full state snapshot on every tap and downloading all of them on every open.

---

# High severity

## H1. Opening the app with no signal locks the family out of their own cached data

**Files:** `household-access.js:81-97` (`requireHouseholdSession`), `app.js:101`, `service-worker.js:1`

**Symptom.** Cold start with no network shows the family-key form and never proceeds, even though the app shell and a full local copy of the menu, groceries, and inventory are in cache.

**Cause.** Boot is gated on a live call to `/.netlify/functions/households`. The service worker deliberately skips `/.netlify/functions/` paths, so the fetch hits the network and rejects. The rejection has no `status`, so `requireHouseholdSession` takes the "We could not reach your household" branch, falls through to `gate.hidden = false`, and returns a promise that only resolves on form submit.

**Why it matters.** This is the exact failure mode the PWA exists to prevent: a phone in a grocery store with two bars, opening the list it was built for.

**Fix.**
- Cache the validated household profile (id, name) in `localStorage` alongside the access key on every successful `fetchHousehold`.
- Distinguish network failure from rejection: only a real `401` should clear the saved key and force the gate.
- On network failure with a cached profile, resolve the session from cache, set an offline indicator, and revalidate in the background.

**Verify.** Load the app online once, then go offline (DevTools offline or airplane mode) and cold-start it. The Today view should open with cached data and an offline badge. Then confirm a genuinely invalid key still lands on the gate with the 401 message.

---

## H2. Version conflicts silently discard local edits (in-place mutation defeats the three-way merge)

**Files:** `app.js:125-127`, `app.js:1800`, `app.js:1816`, `grocery-ui.js:331` (and the other in-place mutations in `bindGroceryControls`), `versioned-collection-client.js:18` (`mergeVersionedItems`)

**Symptom.** Two family members shopping at once: one person checks off ten items, the other adds one, and the ten checkmarks disappear with only a conflict status message.

**Cause.** `mergeVersionedItems` decides a local change occurred with `JSON.stringify(localValue) === JSON.stringify(baseValue)`. But local and base are the same array of the same objects:

```js
// app.js:125-127
let groceries       = storedGroceries.items;
let groceryVersion  = storedGroceries.version;
let groceryBaseItems = storedGroceries.items;   // same reference

// app.js:1800, after a successful save
groceryBaseItems = groceries;                    // same reference again
```

and the grocery handlers mutate items in place rather than replacing them:

```js
// grocery-ui.js:331
item.checked = checkbox.checked;
if (!checkbox.checked && isConfirmedAtHome(item)) item.inventoryDecision = "need";
item.inInventory = isConfirmedAtHome(item);
touchItem(item);
```

Mutating `item` mutates the base copy too, so `sameValue(local, base)` is always true, `localChanged` is always false, and the remote value wins for every item. The merge built specifically to protect concurrent shoppers cannot see local edits at all.

**Fix.** Either one works; doing both is better.
- Deep-clone whenever a base snapshot is set: `groceryBaseItems = structuredClone(groceries)` at init and after each successful save. Apply the same treatment to `sharedStateBaseState` in `app.js` (`performSaveSharedState`, `applyLoadedSharedState`), which has the same aliasing shape.
- Make the grocery handlers replace items immutably (`setGroceries(getGroceries().map(...))`) instead of mutating, which removes the entire class of bug.

**Verify.** Add a regression test in `tests/versioned-collection-client.test.mjs`: build `local` and `base` from the same object, mutate a field on the local item, and assert `mergeVersionedItems` keeps the local value. Then exercise it for real: check items on device A, save an unrelated change from device B first to force a 409, and confirm A's checkmarks survive.

---

## H3. Inventory conflicts have no merge at all

**Files:** `app.js:1872-1886` (`saveInventory` catch block), `versioned-collection-client.js:74` (`applyVersionConflict`)

**Symptom.** An inventory version conflict replaces local inventory wholesale with the server copy. Items just unpacked from the shopping bags are gone.

**Cause.** Groceries at least attempt `mergeVersionedItems` after `applyVersionConflict`. Inventory calls only `applyVersionConflict`, which does `setItems(error.data.items)` and returns, then shows a neutral `inventoryConflict` status.

**Fix.** Mirror the grocery path (after H2 is fixed, so the merge actually works): keep a cloned `inventoryBaseItems`, call `mergeVersionedItems(localItems, inventoryBaseItems, error.data.items)`, retry once with `{ retrying: true }`. Also make the conflict copy say what happened to the user's changes rather than only that a conflict occurred.

**Verify.** Add a test alongside the grocery conflict test. Manually: add an item on device A while device B saves, and confirm A's item is still present after the merge.

---

## H4. Recipe yield is optional, hidden, and usually zero, so scaling, batches, and leftovers silently do nothing

**Files:** `recipe-form-ui.js:201` (`recipePayload`), `recipe-utils.js` (`servingsForRecipe`, `normalizeRecipeServings`), `schedule-utils.js:193` (`recipeBatchPlan`), `netlify/functions/recognize-recipe.js:65` (prompt), `app.js` (`generatedGroceriesFromPlan`, `generatedGroceriesForMeal`)

**Symptom.** A family plans dinner for six from a recipe that serves four and the generated grocery list buys for four. Leftover predictions on Today and in Cook Along stay empty.

**Cause.** The whole serving engine depends on one number, and all three sources of it usually produce `0`:

- `recipePayload` uses `servings: Number($("#servingsInput")?.value) || 0`. The field lives inside the collapsed "Type or review recipe details" disclosure and is never required to publish.
- The photo scanner prompt says: *"Only return servings when the yield is visible in the photos; otherwise use 0."*
- `servingsForRecipe`'s fallback only parses `serves N` out of `recipe.meta`, and uploads get meta `"Shared upload"` / `"Local draft"`.

Then `recipeBatchPlan` returns `null` when `recipeServings <= 0`, and callers fall back to `batches = 1`. So ingredients are not scaled and `expectedLeftovers` is `0`. The feature looks present and does nothing, with no signal to the user.

**Fix.**
- Require a yield to publish a recipe (validate in `submitUploadForm` next to the existing name/ingredients/steps checks), and surface the field outside the collapsed disclosure.
- When a recipe with no yield is first added to a meal, prompt for it inline: one number, one tap.
- Where the yield is still unknown, assume a default (4) and label it as assumed in the UI rather than skipping the math silently.
- Backfill: offer a one-time "these recipes need a yield" list rather than requiring the family to hunt for them.

**Verify.** Plan a 4-serving recipe for a 6-serving meal and confirm the grocery quantities scale and the batch/leftover figures appear. Add a `tests/schedule-utils.test.mjs` case asserting that a zero yield surfaces the assumed-servings path instead of silently returning `null`.

---

## H5. Spanish mode replaces real content with "Translation pending"

**Files:** `app.js:502-505` (`localizeExact`), `app.js:1435` and `app.js:1489` (the `localize` injected into `dashboardUi` and `scheduleUi`), `language-quality.js` (`appearsEnglish`), `grocery-ui.js` (`groceryDisplayText`)

**Symptom.** In Spanish, Today, Week, and the grocery list show a "Translation pending" placeholder instead of recipe and ingredient names. A Spanish-speaking caregiver cannot see what is for dinner.

**Cause.** Two paths, same result.

```js
// app.js:1435
localize: (value) => localizeExact(value) || t("translationPendingShort"),
```

`localizeExact` calls `localizedTextExact`, which returns `""` when the field has no `.es` value. So any recipe without Spanish text renders as the placeholder rather than falling back to English.

Second, `localizeExact` also suppresses text that `textMatchesLanguage` rejects, and that runs on `appearsEnglish()`: a hand-rolled detector over roughly 60 hardcoded marker words (`"lager"`, `"lard"`, `"shoulder"`, `"minutes"`). Genuinely Spanish text that misses the threshold gets hidden too. A 60-word heuristic decides whether real content is allowed to display.

The repair path is per recipe, per language, by hand: open the recipe, tap "Translate this recipe", one OpenAI call each.

**Fix.**
- Fall back to the language you have, with a small `EN` marker, instead of a placeholder. Showing "Chicken Milanese" to a Spanish reader beats showing nothing.
- Queue translation automatically when a recipe is published or first planned, instead of requiring a manual tap per recipe.
- Replace the heuristic with an explicit per-field language tag recorded at write time (you already know the entry language: `getLang()` is passed to `updateLocalizedText` everywhere). Keep `appearsEnglish` only as a migration aid for existing records.

**Verify.** Switch to Spanish with a library of English-only recipes. Today, Week, Recipes, and the grocery list should all show readable names. Extend `tests/content-localization.test.mjs` to assert the fallback rather than the placeholder.

---

## H6. Every save writes a full state snapshot; every app open downloads all thirty

**Files:** `netlify/functions/family-state.js:357-382` (audit write), `audit-logic.js:2` (`MAX_STATE_SNAPSHOTS = 30`), `audit-logic.js:89` (`stateSnapshot`), `app.js:1302` (`loadAuditHistory`), `app.js:2404` (unconditional boot call), `app.js:549` (`navigateWeek`)

**Symptom.** Disproportionate Netlify function, blob, and bandwidth usage against a stated low-cost constraint. Saves get slower as the calendar fills.

**Cause.** Three compounding issues.

1. Each `PUT /family-state` reads the audit blob, prepends an event **and** a snapshot, then writes it back, on top of the state write itself. That is 2 extra blob reads and 1 extra large blob write per save.
2. `stateSnapshot` stores untrimmed `schedule` and `calendarMeals`. `calendarMeals` is capped at 730 days, and 30 snapshots are retained, so the audit record trends toward thirty copies of a two-year calendar.
3. Almost everything saves state, including pure navigation: `navigateWeek` and `goToCurrentWeek` both end in `await saveSharedState()`. Paging through weeks writes the blob every tap.

On the read side, `loadAuditHistory()` runs unconditionally at boot and pulls the entire blob to populate a collapsed `<details>` panel that renders 20 events and 10 snapshots.

**Fix.** Three independent wins, smallest first.

- Lazy-load the audit: move `loadAuditHistory()` behind the `<details>` `toggle` event for `#householdHistory`.
- Trim snapshots: store only the dates listed in the event's `changedDates`, or throttle snapshot creation to at most one per hour or per meaningful change. Reduce `MAX_STATE_SNAPSHOTS` toward the 10 the UI actually shows.
- Stop persisting on navigation: `navigateWeek` should render and update the local week pointer without a remote write. Persist `weekStart` on an actual edit, or debounce it.

**Verify.** Count function invocations for a session of paging through four weeks: it should be zero writes, not four. Confirm the change-history panel still populates when opened.

---

# Medium severity

## M1. A background sync erases whatever someone is typing

**Files:** `dashboard-ui.js:150` (`renderToday` sets `handoffNote.value`), `budget-ui.js:13` (`renderBudget` sets `#monthlyBudgetInput.value`), `inventory-ui.js:127-137` (row amount/unit/expiration inputs rebuilt), `cook-along-ui.js:50` (finish form `innerHTML` replaced)

The full `render()` writes over live form fields, and those fields commit on `change` (blur), so anything uncommitted is lost. `render()` fires whenever a fetch completes and on every `visibilitychange` / `focus` refresh (`app.js`, `refreshSharedDataOnReturn`). Typing an expiration date while inventory syncs, or a note for the next cook when the app returns to the foreground, silently discards the entry.

**Fix.** Skip the write when the element is `document.activeElement`, or track a dirty flag per field and only refresh clean fields. Separately, Cook Along's timer calls `render()` once per second, rebuilding the whole panel: give the timer its own text node.

---

## M2. "Remove receipt" stops working after any re-render

**File:** `budget-ui.js:14-43`

`renderBudget()` replaces `#receiptHistory.innerHTML` on every app render but never rebinds. Listeners are attached only by `bindReceiptRemoval()`, called once from `bindBudgetControls()` at boot and from its own handlers. After the first unrelated render, the Remove buttons are dead nodes. A mis-scanned receipt total stays in the budget and the button appears to do nothing.

**Fix.** Delegate from the static `#receiptHistory` container using the `controlsBound` guard pattern already in `grocery-ui.js`, or call `bindReceiptRemoval()` at the end of `renderBudget()`.

---

## M3. Shared state is one blob with a 3 MB ceiling, and use pushes it there

**Files:** `netlify/functions/family-state.js:25` (`MAX_REQUEST_BYTES = 3000000`), `netlify/functions/_http.js:13`

One record holds up to 730 calendar days, 500 receipts, 200 activity entries, 300 tasks, and 300 `recipeEdits` that may each carry base64 photos up to 500 KB. Past the limit every save returns 413, and the client treats it like any other failure: cache locally, show "saved locally", offer retry. Retry can never succeed, so the household silently stops syncing while the UI reports success.

**Fix.** Move receipts and activity into their own versioned records (the pattern already exists for groceries, inventory, and dinner history). Keep photos out of shared state entirely. Give 413 a distinct, honest message instead of an infinite retry loop.

---

## M4. A missing version number disables conflict detection

**File:** `netlify/functions/_versioned-record.js:17`

```js
export function hasVersionConflict(incomingVersion, currentVersion) {
  const parsed = Number(incomingVersion);
  return Number.isFinite(parsed) && parsed !== currentVersion;
}
```

Omit `version` and you get `NaN`, not finite, no conflict, and a blind overwrite of the household record. The guard fails open, which is the wrong direction for the one check standing between two devices and data loss.

**Fix.** Treat a missing or non-numeric version as a conflict and return 409 with the current record. Current clients always send it, so nothing breaks today.

---

## M5. Nothing caps AI spend per household

**Files:** `netlify.toml:8` (rate limit), `netlify/functions/recognize-receipt.js:105` (`detail: "high"`, 4 images), `recognize-inventory.js` (6 images), `recognize-recipe.js`, `import-recipe-url.js`, `translate-recipe.js`

All five AI endpoints require only a household key, which is a bearer token that travels by screenshot and text message. The only brake is a Netlify redirect rule allowing 180 requests per 60 seconds per IP, which is generous enough to run a large bill, trivially distributed across IPs, and attached to a `/*` self-redirect whose coverage of `/.netlify/functions/*` should be confirmed rather than assumed.

**Fix.** Add a per-household daily counter in Blobs for the AI routes. A couple of dozen scans per day sits far above real family use and far below a painful invoice. Verify the rate limit applies to function paths. Consider `detail: "auto"` for receipt scans.

---

## M6. A family key cannot be rotated, and a lost one orphans the household

**File:** `netlify/functions/_household.js:25-69`

The profile is stored only at `access:{sha256(key)}`, and household data at `household:{id}:*` is reachable only through that lookup. There is no index from household id back to the digest. A leaked key can never be revoked (a caregiver who leaves, a screenshot in a group chat, a shared iPad), and a lost key strands a year of meal plans, recipes, and receipts with no recovery path. `PRODUCT.md` lists this as a known gap; it becomes a different kind of problem once the app goes out to friends.

**Fix.** Store the profile under the household id and keep `access:{digest}` as a pointer record. Rotation is then writing a new pointer and deleting the old; recovery is an owner-held second key. Neither needs new infrastructure. This is a persisted-data change: use `$safe-database-change` and migrate existing records.

---

## M7. Every inventory match costs a manual two-button decision

**Files:** `grocery-logic.js:237-246` (`applyInventoryCoverage`), `grocery-logic.js:79` (`inventoryMatchFor`), `grocery-ui.js:275` (review row markup)

`applyInventoryCoverage` stamps `inventoryDecision: "review"` on every generated item that matches something at home, and a review item renders with its checkbox suppressed plus "Keep on list" and "Have enough" buttons. Matching is deliberately loose: `inventoryMatchFor` requires only that every word of the inventory item appear in the ingredient, after stripping units and a trailing `s`. So "milk" matches "coconut milk", and "hummus" becomes "hummu". A week's plan against a stocked pantry can open with dozens of decisions standing between the family and a usable list.

**Fix.** Only ask when the answer matters. Auto-resolve to "have" when units are compatible and the amount at home covers the need, auto-resolve to "need" when it clearly does not, and reserve the prompt for genuine ambiguity. Add a section-level "I have all of these" so review is one tap rather than twenty.

---

## M8. "Build shopping list" resets everything already checked off

**Files:** `grocery-logic.js:213` (`replacePlannedGroceries`), `app.js:2234` (`#generateGroceries` handler)

`replacePlannedGroceries` keeps only items whose source is not `meal-plan` or `week-plan`, then rebuilds the rest from scratch, dropping `checked`, `inventoryDecision`, and every review answer. The button lives in "Add or rebuild the list", which auto-opens whenever the list is empty, so it is easy to hit mid-trip. Regeneration is correctly idempotent in content but not in the state the shopper created.

**Fix.** Carry `checked`, `inventoryDecision`, and `updatedBy` across by `ingredientKey` when rebuilding, and label the button so the behavior is predictable.

---

## M9. Suggestion ranking is quadratic and runs on every render

**Files:** `memory-logic.js:227-277` (`recommendationForRecipe`, `rankedRecipes`), `app.js:1352` (`renderSmartSuggestions`)

`recommendationForRecipe` re-runs `normalizeFamilyMembers`, `normalizeFamilyPreferences`, `normalizeFamilyRules`, and `normalizeDinnerEvents` for **each** recipe, and `rankedRecipes` calls it for all of them. With 200 recipes and a year of dinner history that is hundreds of thousands of object constructions, inside `renderSmartSuggestions()`, inside every `render()`. Expect Today-screen jank on a mid-range phone exactly as history accumulates and the feature starts to matter.

Separately, scoring accumulates without bound: `matchingEvents.forEach` adds up to +5 per past dinner with no recency decay, so the most-cooked recipe eventually wins by default. That works against priority 2 in `PRODUCT.md`.

**Fix.** Normalize the context once in `rankedRecipes` and pass it down; index events by recipe id in a single pass. Then weight outcomes by recency, or average rather than sum, so a recipe cooked twenty times does not permanently outrank one loved twice.

---

## M10. Everyday actions sit three and four disclosures deep

**File:** `index.html:527-559` (inventory tools), `index.html:198` (`today-tools`)

Adding something to home inventory is Groceries, then At Home, then "Manage", then "Add item", then the form: four taps before the keyboard appears, on the screen a parent uses standing at an open fridge. Today's tasks, favorites, and the snacks/leftovers panel are all inside a "Household tools" `<details>`, so the shared checklist is invisible until someone looks for it.

**Fix.** Give "At Home" a persistent add row at the top, the way the grocery list has one. Promote today's checklist out of Household tools. Keep disclosures for genuinely occasional things (receipt history, change history).

---

## M11. The way in is English-only

**Files:** `household-access.js:81-97`, `index.html:14-56` (gate markup, no `data-i18n` attributes), `app.js:2205-2213` (copy-key statuses, `leaveHousehold` confirm)

Confirmed on the live site: the household gate has no language toggle and every string is hardcoded English. "Paste the key shared by your family", "Checking your family key...", "That saved household key no longer works" all arrive in English regardless of device. A Spanish-speaking caregiver's first and most confusing screen, the one where a wrong paste locks them out, is the one screen with no Spanish. This is against invariant 9.

**Fix.** Move the gate strings into `translations.js`, add the EN/ES toggle above the panel, and pick the initial language from `navigator.language` before any key exists.

---

## M12. A new household opens onto the Ryan family's week

**Files:** `schedule-utils.js:241` (`defaultSchedule`), `app.js:105` (`selectedRecipeId = "meatballs"`), `app.js` (`todaysRecipeId` fallback), `index.html:162-165` (hardcoded title and backdrop)

`normalizeSchedule(raw)` falls back to `defaultSchedule`, a hardcoded five-day plan (meatballs, chicken milanese, lemon chicken, halibut, pasta with meat sauce). Another family's first impression is a week of someone else's dinners they now have to clear, with no way to tell placeholder from plan.

**Fix.** Default to an empty week with a real empty state. Keep the seed recipes as a browsable library; that part is a genuine head start.

---

## M13. Quarter-batch math produces quantities nobody can shop for

**File:** `schedule-utils.js:197`

```js
const batches = Math.ceil((needed / recipeYield) * 4) / 4;
```

That number is passed straight into `recipeGroceries(..., scale)`. Cooking for three from a recipe that serves four yields 0.75 batches, so the list asks for three-quarters of an egg and 0.75 packages. Cooking for five gives 1.25.

**Fix.** Round batches to halves at the coarsest, and to whole batches for anything with countable units. Show the surplus as expected leftovers rather than shaving the shopping list to fractions of a package.

---

## M14. Unicode fractions and ranges never scale

**File:** `grocery-logic.js:19` (`parseIngredientAmount`)

```js
const match = text.match(/^(?:(\d+)\s+)?(\d+\/\d+|\d+(?:\.\d+)?)\s+(.+)$/);
```

ASCII digits only. "1/2 cup flour" written as a Unicode fraction, "1-2 tbsp oil", and "a pinch of salt" all return `quantity: 0`, and `scaleIngredientText` passes them through untouched while their neighbors double. Web imports are full of Unicode fractions, so one line of a scaled list is right and the next silently is not, with no marker distinguishing them.

**Fix.** Normalize the Unicode fraction block (U+215B to U+215E and friends) before matching, and handle `N-M` by taking the lower bound. Where a quantity is genuinely unparseable, mark the item "amount not scaled" so the shopper knows to judge it.

---

## M15. The recipe-import SSRF filter is string matching and can be walked around

**File:** `netlify/functions/import-recipe-url.js:29-36` (`isBlockedHost`, `safeUrl`)

The check tests literal prefixes and a dotted-decimal regex, so it stops `127.0.0.1` and `169.254.169.254` but not `http://2130706433/`, not `http://[::ffff:7f00:1]/`, and not any hostname that simply resolves to a private address. The fetched body is parsed and returned to the caller, which makes it a read channel rather than a blind request. `redirect: "manual"` and the size cap are good; the host check is the weak link.

**Fix.** Resolve the hostname and validate the resulting IP against private ranges rather than pattern-matching the string. Reject non-standard ports. Keep the manual-redirect stance, and re-validate on any redirect you later choose to follow.

---

## M16. One null array entry 500s an entire save

**Files:** `netlify/functions/family-state.js:223` (`cleanReceipt`), `netlify/functions/groceries.js:15` (`cleanItem`), `netlify/functions/inventory.js:21` (`cleanItem`)

These sanitizers start with optional chaining and then drop it. `cleanReceipt` does `Number(item?.total)` and then `cleanText(item.store, 120)`. Both `cleanItem` functions open with `cleanLocalizedText(item.text, 220)`. A `null` in the array throws, the function returns an unhandled 500, and the whole household save fails. Reachable by a client bug leaving a hole in a list, and trivially by anyone with a key.

**Fix.** Filter non-objects at the top of each `clean*s` function and use `item?.` consistently. Tolerant readers are already the house style; these three spots do not follow it.

---

# Low severity

## L1. The CSP blocks the recipe-card animation it was meant to stagger

**Files:** `recipe-library-ui.js:67`, `styles.css:4282`, `netlify.toml` (CSP header)

Cards render with `style="--card-order: ${...}"` and the stylesheet uses `animation-delay: calc(var(--card-order) * 24ms)`. The served CSP is `style-src 'self'` with no `'unsafe-inline'`, which blocks inline style attributes. Confirmed on the live site: setting that attribute on a real element returns an empty computed value. The custom property never lands, the `calc()` is invalid, every card animates on the same beat, and each render logs a CSP violation.

**Fix.** Set it from script after insertion (`el.style.setProperty("--card-order", n)`, which CSSOM allows) or move the stagger to `:nth-child` delays. Keep the CSP as it is.

---

## L2. Recipe 201 silently makes the oldest recipe unreachable

**File:** `netlify/functions/recipes.js:91` (`writeRecipe`)

The next index is built and then `.slice(0, MAX_RECIPES)` is applied. Past 200 recipes the oldest entry drops out of the index while its blob stays behind, so the recipe vanishes from the library with no warning and no UI path back.

**Fix.** Reject the write with a clear message at the cap, or paginate the index. Silent eviction is the outcome to avoid.

---

## L3. Three hand-maintained version stamps gate every deploy

**Files:** `index.html:11` (`styles.css?v=75`), `index.html:890` (`app.js?v=118`), `service-worker.js:1` (`CACHE_NAME`)

All three are bumped by hand, and the service worker serves `index.html` cache-first. Forget the cache name and the deploy is a silent no-op: everyone keeps running the old app while the push, the build, and the tests all pass. The existing test pins them together, which catches drift in CI but still relies on someone editing three places.

**Fix.** A short Netlify build command that stamps a content hash into all three from one source removes the failure mode without introducing a bundler.

---

## L4. Dead auth module still ships

**Files:** `netlify/functions/_auth.js`, `tests/auth.test.mjs`

`requireWriteAuth` and `FAMILY_WRITE_TOKEN` are used by nothing. `DEPLOYMENT.md` says so, and `tests/http-utils.test.mjs` asserts no function imports it. It also returns `null` (allow) when the token is unset, which is the kind of helper someone reuses by mistake later.

**Fix.** Delete the module and `tests/auth.test.mjs`. Keep the guard assertion in `http-utils.test.mjs` as a tripwire.

---

## L5. Dietary restrictions match by substring

**File:** `memory-logic.js:235`

`text.includes(preference.value.toLocaleLowerCase())` runs against a blob of the recipe's id, category, names, ingredients, and allergy text. A restriction of "egg" scores the recipe at -10000 and drops it from suggestions with no explanation. "nut" takes out "butternut", "corn" takes out "peppercorn". It affects ranking only, not the safety warnings, but the disappearance is invisible to the family that configured it.

**Fix.** Match on word boundaries, and say why something was filtered ("hidden by Grace's egg restriction") so a false positive is fixable rather than mysterious.

---

## L6. Commas split grocery entries

**File:** `app.js:1110` (`manualGroceryItemsFromText`)

Splitting on `/\n|,|;/` makes multi-item entry easy but mangles real items that contain a comma ("milk, 2%").

**Fix.** Split on newlines and semicolons. Treat a comma as a separator only when the text has no newlines and every fragment is short.

---

## L7. No HSTS header

**File:** `netlify.toml`

The header block is otherwise strong: CSP, `nosniff`, `DENY`, a tight `Permissions-Policy`. `Strict-Transport-Security` is the missing piece, and the family key travels in a request header on every call.

**Fix.** `Strict-Transport-Security = "max-age=31536000; includeSubDomains"`.

---

## L8. Leaving a household leaves its cached copy on the device

**File:** `household-access.js:137` (`leaveHousehold`)

The access key is removed and the page reloads, but every `family-menu:{householdId}:*` entry stays in `localStorage`: the menu, groceries, inventory, receipts. Isolation holds because the prefix keeps households apart, so this is residue rather than a leak, but it is residue on a device someone just handed back.

**Fix.** Clear keys matching the household prefix before reloading, and say what happens in the confirm dialog.

---

# What is already solid

Context for the list above. The foundations are better than the finding count suggests, and several fixes are small precisely because the structure is right.

- **Output escaping is disciplined.** Every interpolation runs through `escapeHtml`, including attributes, with `tests/render-attribute-escaping.test.mjs` pinning it. No XSS path was found across 142 `innerHTML` sites.
- **Household isolation holds.** Every endpoint calls `requireHouseholdAccess` before touching storage, keys are namespaced through `householdDataKey`, and browser fallbacks go through the prefixed `createHouseholdStorage`.
- **Keys are stored as digests.** Only `sha256(key)` reaches the blob store.
- **The empty-overwrite guard is a genuinely good idea.** Refusing a save that would wipe every planned meal unless `allowEmptySchedule` is set has probably already saved someone's week.
- **Tolerant readers and legacy compatibility** are handled carefully and consistently, with legacy meal fields kept in sync rather than dropped.
- **Request bodies are bounded everywhere**, with per-endpoint limits and both content-length and actual-byte checks.
- **45 test files** covering the logic modules, plus structural tests for the service-worker module graph and cache version.
- **The docs match the code.** The `AGENTS.md` invariants are real invariants, and `DEPLOYMENT.md` is honest about what is not wired up.
