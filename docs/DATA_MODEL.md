# Data Model

## Overview

Ryan Family Menu does not have relational tables or a migration framework. Production data is stored as JSON records in Netlify Blob stores. The schema is enforced by normalizers and sanitizers in JavaScript.

Every shared data key must be scoped as:

```text
household:<household-id>:<record-key>
```

The household profile lookup is the exception: it is keyed by a SHA-256 digest of the private household access key.

## Ownership Model

- A household owns all shared meals, recipes, groceries, inventory, receipts, preferences, and history in its namespace.
- All household members with the household key share equal read/write access.
- Member names and `updatedBy` values are attribution, not authenticated identities.
- Local drafts and fallback copies are owned by one browser but are still namespaced by household ID.

## Blob Stores

| Store | Household record | Contents |
|---|---|---|
| `family-menu-households` | `access:<key-digest>` | Household profile: ID, name, created and updated timestamps |
| `family-menu-state` | `shared-state` | Main shared family-state record |
| `family-menu-state` | `schedule` | Versioned meal-plan record (schedule, calendar overrides, week start) |
| `family-menu-dinner-history` | `events` | Versioned dinner history |
| `family-menu-groceries` | `items` | Versioned grocery list |
| `family-menu-inventory` | `items` | Versioned inventory |
| `family-menu-recipes` | `recipe-index`, `recipe:<id>`, legacy `recipes` | Shared recipe index and records |
| `family-menu-audit` | `history` | Bounded household menu-change events and recoverable prior menu snapshots |

`householdDataKey()` wraps every record key except household access profiles.

### Recipe catalog reads

Recipe records remain unchanged and are still stored under the household-scoped index and `recipe:<id>` keys. The browser’s catalog cache is a separate local household-scoped envelope with `schemaVersion: 2`, `recipes`, and `fetchedAt`; it deliberately excludes embedded `data:image/` media. The `?view=catalog` endpoint is a read-only compact projection for startup. The existing full recipe response remains available for older clients, and no production record migration is required.

## Versioned Record Envelope

Shared state, dinner history, groceries, and inventory use this compatibility envelope:

```json
{
  "items-or-state": [],
  "version": 3,
  "updatedAt": "2026-08-15T12:00:00.000Z"
}
```

The data field is `state` for family state and `items` for the three collections. Older unwrapped values are read as version zero. Writers submit the last version they observed; a mismatch returns `409` and the newest server copy. Versioned writes fail closed when the client omits or sends an invalid version, so an unknown client cannot overwrite a newer household record.

Receipts and activity now also have household-scoped versioned ledger records (`family-ledger`, keys `household:{id}:receipts` and `household:{id}:activity`). The browser dual-reads legacy shared-state fields and adopts them into the ledger on first successful load. New shared-state writes omit these growing arrays; legacy readers remain compatible while households transition.

Do not remove legacy-envelope support until existing household data has been inspected and explicitly migrated.

## Main Shared State

The main record is created by `sharedStateSnapshot()` in `family-state.js` and cleaned by `cleanState()` in `netlify/functions/family-state.js`.

Important fields:

- `weekStart`: visible week anchor.
- `schedule`: seven recurring/effective day records keyed `mon` through `sun`. New clients read and write this through the household-scoped `schedule` record so meal edits do not compete with unrelated profile, budget, or recipe edits. The legacy `shared-state` schedule remains readable during the transition; do not delete it until all old clients are retired.
- `calendarMeals`: date-specific meal records keyed `YYYY-MM-DD`, capped at 730 days.
- `favorites`: recipe IDs.
- `tasks`: shared household tasks.
- `availableFood`: leftovers and snacks to use soon.
- `recipeFeedback`: legacy aggregate recipe outcomes.
- `budgetSettings`: monthly target.
- `receipts`: receipt summaries used for budget calculations.
- `activity`: recent household attribution entries.
- `familyMembers`: member profiles.
- `familyPreferences`: restrictions, dislikes, likes, and reliable meals linked by member ID.
- `familyRules`: household planning preferences.
- `recipeEdits`: edits for seeded or shared recipes.
- `deletedRecipeIds`: recipes hidden from the household library.

The record has collection limits and a three-megabyte request cap. A new field must be added to both the browser snapshot/normalizer/local persistence and the server sanitizer.

## Household audit history

The `family-menu-audit` record is separate from editable shared state so a stale or empty browser save cannot erase the recovery trail. It contains bounded arrays of `events` (actor, time, version, action, and changed dates) and `snapshots` (the prior schedule/calendar meal plan). The server keeps at most 200 events and 30 snapshots. Reading requires the same household key as the main menu. Restoring a snapshot writes a new shared-state version and creates another audit entry; it never deletes history.

## Meal Record

The canonical meal format is `mealItemsVersion: 1` with an `items` array. Each item identifies:

- meal period: breakfast, lunch, or dinner;
- role: main, side, salad, dessert, sauce, drink, or other;
- recipe ID;
- source type: recipe or allocated leftover;
- optional leftover source date, source item ID, and servings.

A meal also stores:

- localized notes;
- dinner pace: quick, standard, no-cooking, or blank;
- handoff flags and details;
- default and per-period serving plans;
- optional `extraServings` on each period plan for portions intentionally cooked for a later meal;
- actual leftovers keyed by meal-item ID.

Legacy fields such as `breakfast`, `lunch`, `lunchSalad`, `dinner`, `main`, `side`, and `salad` remain synchronized so older clients and household records keep working. Do not remove or reinterpret them casually.

## Family Memory

### Family member

- stable `id`;
- display `name`;
- role: adult or child;
- active/archive state;
- spice tolerance from 0 to 3;
- attribution timestamps.

### Family preference

- stable `id`;
- `memberId` relation to a family member;
- kind: restriction, dislike, like, or reliable;
- short text value;
- attribution timestamps.

Restrictions are used as hard recommendation exclusions. Other preferences and history influence ranking but are not absolute rules.

### Family rules

Current rule fields include repeat window, maximum weeknight prep time, minimum kid-safe dinners, maximum pasta dinners, and a preference for leftovers at lunch. These are planning preferences, not permission controls.

### Dinner event

Dinner history is separate from the main state so feedback can grow independently. One event represents one household date and includes planned dinner snapshots, status/outcome, optional attendee IDs, optional member reactions, leftovers, notes, and attribution. Normalization keeps one editable event per date and bounds retained history.

## Groceries

A grocery item includes localized text, store, checked state, origin, recipe metadata, inventory guidance, attribution, and structured planned quantities/units.

Inventory guidance is deliberately explicit. `inventorySuggested` records that a name match was found, while `inventoryDecision` is `review`, `need`, or `have`. A match does not reduce the displayed planned amount or mark an item complete until a shopper chooses **Have enough**. Older rows with `inInventory: true` and no decision are treated as `review`, so potentially stale inventory cannot remain silently hidden. `inInventory` remains the backward-compatible signal for an item explicitly confirmed as already covered.

Generated items also retain `mealUses`: date, meal period, recipe, batches, and servings. This provenance makes regeneration idempotent and permits shared ingredients to aggregate without double-counting.

Do not change `source`, `ingredientKey`, `mealUses`, or quantity semantics without regression tests for rebuilding a plan, changing servings, shared ingredients, legacy generated rows, and months with many meal uses.

At the store, `checked` means the shopper says the item was purchased. Finishing a trip removes those checked rows and merges them into home inventory. A scanned receipt may match additional rows before completion. A manually entered receipt total has no line-item knowledge, so it only moves rows the shopper checked.

Receipt summaries live in shared family state and include store, date, total, item count, and attribution. They drive monthly budget totals; they are not a second inventory or grocery-item ledger.

## Inventory

An inventory item includes localized text, optional freeform quantity, structured amount/unit, expiration date, location, stock state, one optional photo, and attribution.

Locations: pantry, fridge, freezer, household. Stock states: full, some, low, out.

Inventory quantities provide shopping guidance but never silently reduce or remove a generated grocery amount. Changes to matching, review, or amount semantics can cause households to overbuy or underbuy.

## Recipes

Shared recipe records include localized names, ingredients, steps, safety warnings, notes, category, servings, up to three source photos, one card photo, and created timestamp.

Important distinctions:

- Bundled recipes live in `recipes-data.js` and are code, not Blob records.
- Published household recipes live in individual Blob records and an index.
- Edits to recipes live in shared family state.
- Incomplete drafts live only in household-scoped browser storage.
- Hidden/deleted behavior is currently a shared-state overlay, not destructive record deletion.

## Local Storage

The raw household access key is stored globally as `family-menu-household-key`. Household data is stored through `createHouseholdStorage()` under:

```text
family-menu:<household-id>:<local-key>
```

Important local keys include schedule, calendar, versions, favorites, tasks, groceries, inventory, budget, receipts, activity, family memory, dinner history, recipe edits, deleted recipe IDs, and drafts.

Changing these names without migration can make existing browser fallbacks disappear. Never move household data to unscoped local storage.

## Migration and Change Rules

1. Prefer additive fields with safe defaults.
2. Make readers tolerate old and new records before writers emit the new form.
3. Update client normalization, server cleaning, local persistence, UI, and tests together.
4. Preserve IDs and ownership relationships.
5. Bound new strings, arrays, images, and request bodies.
6. Decide whether a collection needs optimistic versioning.
7. Test representative legacy records and a full write/read round trip.
8. Document the decision in `DECISIONS.md` when field meaning, ownership, access, or compatibility changes.
9. Never bulk-delete or rewrite production Blobs without explicit approval, a verified backup, exact targets, and a rollback plan.

The one-time legacy migration code copies the original unscoped records into a new household namespace. It is not a general migration framework.
