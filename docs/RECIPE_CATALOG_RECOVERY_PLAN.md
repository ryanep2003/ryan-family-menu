# Recipe Catalog Recovery Plan

## Objective

Restore the Ryan household's complete recipe library on every device without deleting, rewriting, or migrating production recipe records during the recovery release.

The first release must make all recipes load reliably and quickly. Follow-on work may optimize recipe photos and storage, but the recovery release must not depend on a destructive data migration.

## Confirmed Failure Mechanism

The current client calls `/.netlify/functions/recipes` and waits for every complete recipe record before showing any recipes. `netlify/functions/recipes.js` permits three embedded data-URL photos per recipe at approximately 500 KB each. A household with 60 recipes can therefore produce a very large JSON response.

Four implementation defects compound this:

1. `api.js#getJson()` clears its abort timer immediately after response headers arrive, before `response.json()` finishes downloading and parsing the body. A large or stalled body can therefore leave the UI in `loading` indefinitely.
2. The new recipe cache is populated only after one complete catalog request succeeds, so it cannot rescue a device whose first request stalls.
3. `recipe-library-ui.js` deliberately hides all recipes until catalog status is `ready`, turning transport latency into an empty application.
4. The final `if (!filtered.length)` branch overwrites the loading/unavailable markup and its retry control because `filtered` is necessarily empty while the catalog is not ready.

Recent releases did not delete or rewrite recipe records. Treat the production records as present until read-only verification proves otherwise.

## Safety Boundaries

- Do not delete or rewrite any production recipe Blob.
- Do not change recipe IDs.
- Preserve existing meal-plan references, grocery generation, translations, edits, favorites, and hidden recipe IDs.
- Preserve household-key validation and household-scoped Blob keys on every recipe read.
- Keep the existing full recipe GET behavior available for stale clients until the new client path is proven.
- Do not log household keys, recipe contents, photos, or full production responses.
- Do not add polling or rapid retries.
- Do not deploy until `npm test`, `git diff --check`, mobile/browser verification, and the pre-deploy gate pass.

## Release 1 — Recovery

Implement all items in this section as one coherent, backward-compatible release.

### 1. Fix request timeout coverage

File: `api.js`

Keep the abort timer active through all of these operations:

1. `fetch()`
2. response-body download
3. `response.json()` parsing
4. HTTP error construction

Clear the timer in `finally`, not immediately after `fetch()` resolves. Preserve the current optional `timeoutMs` argument. Convert an `AbortError` into the supplied fallback message or another calm, user-facing network timeout message.

Add a focused regression test demonstrating that a response whose headers arrive but whose JSON body stalls is aborted rather than remaining pending forever.

### 2. Add a compact, backward-compatible catalog response

File: `netlify/functions/recipes.js`

Do not replace the existing full GET response yet. Add an explicit compact read mode such as:

```text
GET /.netlify/functions/recipes?view=catalog
```

The compact catalog must retain everything existing application logic currently needs:

- stable `id`
- localized `name`
- `category`
- `servings`
- localized `ingredientsText`
- localized `stepsText`
- localized `allergyWarning`
- localized `notes`
- `createdAt`

It must omit:

- `photos` data URLs
- any `cardPhoto` data URL

An asset-path card photo such as `assets/example.webp` may remain. Include a small Boolean such as `hasSourcePhotos` when useful for later lazy loading.

Use the existing `readRecipes()` and household namespace for this first release. The immediate objective is to remove the large embedded media from the response without modifying stored records.

Keep the existing unqualified GET response intact for backward compatibility. Continue using bounded recipe counts and household access validation.

Add tests proving that compact responses:

- retain IDs and all required cooking text;
- contain no `data:image/` values;
- remain household-scoped;
- handle legacy and indexed recipes;
- are meaningfully smaller for a multi-recipe fixture containing source photos.

### 3. Load the compact catalog from the browser

File: `app.js`

Change the catalog request to `/.netlify/functions/recipes?view=catalog`.

Keep the twelve starter recipes and family-added recipes in one normalized in-memory catalog. Deduplicate by stable recipe ID, with the household record winning when IDs collide.

Do not call the 12 starters a separate user-visible library. They remain only compatibility content and are normalized into the same catalog once the household response arrives.

### 4. Make the cache genuinely stale-while-revalidate

Files: `app.js`, household-scoped storage helpers

Use a new cache schema/key version so partially implemented older cache values cannot masquerade as a complete catalog. Store a small envelope such as:

```json
{
  "schemaVersion": 2,
  "recipes": [],
  "fetchedAt": "2026-08-19T13:00:00.000Z"
}
```

Requirements:

- Cache remains inside `createHouseholdStorage`.
- If a validated cache exists, render it immediately.
- Refresh quietly in the background when stale.
- A failed refresh must never replace a usable cached catalog with an empty/loading screen.
- If no cache exists, show a bounded loading state followed by an unavailable state with a visible retry action.
- A successful response replaces the cache atomically after normalization.
- Do not cache embedded data-URL photos.
- A cache parse or quota failure must not break the live catalog.

Do not use repeated polling. One startup refresh plus explicit retry/online recovery is sufficient.

### 5. Correct the recipe-library state machine

File: `recipe-library-ui.js`

Make these states mutually exclusive:

- `ready`: render the complete normalized catalog and filters.
- `loading-with-cache`: keep cached recipes visible; optionally show subtle updating copy.
- `loading-empty`: show loading and a visible retry/cancel-safe action.
- `unavailable-with-cache`: keep cached recipes visible and show a quiet warning.
- `unavailable-empty`: show a clear error and visible Retry button.

Do not allow the generic `if (!filtered.length)` branch to overwrite loading or unavailable markup. The “no matching recipes” state is valid only when catalog status is ready and the user’s search/filter produces zero results.

The Retry button must be directly visible in Recipes and must restart a completed/failed request. It must not silently attach to an already-stuck in-flight promise. If necessary, keep the active `AbortController` in the recipe loader and abort it before an explicit restart.

Preserve English/Spanish translation-key parity.

### 6. Preserve recipe-dependent workflows

Verify that the compact catalog still supports:

- All showing the complete expected recipe count;
- recipe search and category filtering;
- Week meal selection;
- existing planned-meal names;
- recipe ingredients and steps;
- grocery generation and quantity scaling;
- Spanish translation detection;
- favorites and Family Picks;
- edits and hidden/deleted recipe IDs.

Do not ship the recovery release if compacting the response breaks grocery generation or recipe detail text.

## Release 1 Acceptance Criteria

All of the following are required:

1. A device with no recipe cache reaches either the complete catalog or a visible bounded error; it never remains on “Loading” indefinitely.
2. A device with a valid cache displays recipes immediately, including when offline.
3. A background refresh failure leaves cached recipes visible.
4. The Ryan household’s All category shows the expected complete count (currently approximately 60), not 0 or 12.
5. Opening representative recipes preserves ingredients, steps, servings, safety content, and Spanish behavior.
6. Recipe search, meal selection, and grocery generation work from the compact catalog.
7. No recipe IDs or production records change.
8. No rapid request/retry loop appears in browser Network or Netlify Observability.
9. Mobile layout shows the Retry/error state without navigation overlap.
10. `npm test` and `git diff --check` pass.

## Release 1 Verification

Before deployment:

- Add focused tests for timeout-through-body-parsing, compact catalog sanitization, cache behavior, and UI-state exclusivity.
- Run `npm test`.
- Run `git diff --check`.
- Verify app/service-worker version alignment.
- Exercise a local or mocked 60-recipe catalog containing large data-URL photos and confirm the compact response excludes them.

After deployment, using an existing authorized household browser without printing its key:

- Load Recipes on a device with cleared recipe cache.
- Confirm the complete count appears.
- Open a recipe and inspect ingredients and steps.
- Search and filter.
- Add a recipe to a planned meal, then verify grocery generation remains correct.
- Reload and confirm the cached catalog appears immediately.
- Temporarily simulate offline mode and confirm cached recipes remain visible.
- Inspect Network/console for stalled requests, repeated retries, module errors, and oversized catalog responses.

If production verification fails, revert the code release. Recipe Blob data requires no rollback because Release 1 performs reads only.

## Release 2 — Lazy Full Recipe and Media Loading

Begin only after Release 1 is stable.

Add a household-scoped detail read such as:

```text
GET /.netlify/functions/recipes?id=<recipe-id>
```

Requirements:

- Validate household access before lookup.
- Validate and bound the recipe ID.
- Return one full recipe record, including source photos.
- Fetch it only when a user opens that recipe or explicitly needs its media.
- Merge the detail into the in-memory recipe by ID without changing the catalog order.
- Cache detail records separately and without allowing one household to read another household’s data.
- Continue showing catalog text immediately while detail media loads.

This release may reduce the compact catalog further, but only after proving that meal planning and grocery generation do not require removed fields at startup.

## Release 3 — Separate Image Storage

Begin only after Release 2 is stable and after reviewing current Netlify Blob capabilities and cost.

For new uploads:

- Store image bytes separately from recipe JSON.
- Store only bounded image references/URLs in recipe records.
- Keep household ownership explicit in image keys.
- Lazy-load images.
- Preserve old data-URL records through tolerant readers.

For existing recipes:

- Do not bulk-delete or rewrite images.
- Design a restartable, household-scoped, additive backfill.
- Verify a recoverable backup first.
- Obtain explicit approval before mutating production records.
- Keep old readers working during migration.

## Observability

Add privacy-safe diagnostics for recipe catalog reads:

- household identifier only in an existing non-secret internal form;
- recipe count;
- compact response byte estimate;
- server read duration;
- success/failure status;
- client fetch/parse duration and timeout classification.

Never log household keys, recipe text, or photos. Diagnostics must be bounded and must not create additional polling or function traffic.

## Luna Execution Directive

Start with Release 1 only. Inspect the current implementation before editing, preserve all unrelated work, and implement the smallest coherent recovery release. Do not perform a production data migration. Do not begin image migration merely because the catalog is being touched.

After Release 1 passes its acceptance criteria, report:

- root cause confirmed or revised;
- files changed;
- tests added and actually run;
- measured compact-response reduction from a fixture;
- browser/mobile checks performed;
- any remaining production verification gap;
- exact readiness decision.

Do not deploy unless Eric explicitly authorizes deployment after reviewing the Release 1 result.
