# Reimagining Ryan Family Menu — Day 1 implementation contract

September 22, 2026. Planning artifact for the [week-one plan](REIMAGINING_WEEK_ONE_PLAN.md). This describes proposed behavior, not shipped behavior. All examples are synthetic; no household data or production endpoints were used.

## User job

On a phone, a family member should see what is planned, accept a useful seven-day dinner proposal without losing any existing meal, and adapt one evening when time or attendance changes. Shopping should show the consequences before it changes. Feedback should make later proposals more useful without making hidden claims about the family.

## Existing flow and owners

| Step | Current code and record | Consequence for the new flow |
|---|---|---|
| Open household | `household-access.js` validates a family key, then `app.js` uses `createHouseholdStorage(localStorage, household.id)` | Every draft fallback, if added, must be scoped to that household. Do not include a family key in a draft or screenshot. |
| Read plan | `app.js` loads the versioned `schedule` record. `calendarMeals` overrides recurring weekdays; `schedule-utils.js` normalizes canonical and legacy meal fields. | Draft against seven concrete `YYYY-MM-DD` dates, with the *effective* day record, not just a weekday slot. Keep breakfast, lunch, sides, notes, handoff, and serving plans. |
| Edit one day | `schedule-ui.js` normalizes and mutates a day, then calls `saveSchedule()` in `app.js`. | Approval must compose new dinner items into a current normalized day; it cannot replace the whole date with a proposed dinner object. |
| Save plan | `netlify/functions/schedule.js` validates household access, sanitizes data, and rejects stale versions with `409`. `app.js` locally caches and automatically merges/retries conflicts. | The new approval flow must detect *same-date* concurrent changes and ask for review. Existing automatic whole-date local-wins reconciliation is insufficient for this flow. |
| Build shopping | `app.js` converts planned meals and approved school lunches into groceries, then uses `grocery-logic.js` to scale/merge, and saves the separate versioned groceries collection. | Show a shopping preview after schedule approval. Preserve manual and previously checked rows. A checked ingredient whose quantity rises needs an outstanding-amount/review state; the current boolean checked carry-forward cannot prove all of it is purchased. |
| Record dinner | `memory-logic.js` normalizes one event per household date; `app.js` saves versioned dinner history and some legacy aggregate feedback in shared state. | Learning should favor dated event evidence. Repeated editing of one dinner must not increment aggregate feedback again. Treat a skipped dinner, takeout, or absent response as no preference evidence. |
| Work offline | Static assets reopen through the service worker; `app.js` reads household-scoped local copies and marks pending writes. | A draft can be proposed offline from known data. Approval may be pending but must display that state. A device with an unknown remote version cannot claim shared approval until synchronization resolves. |

## Proposed draft shape

The first release creates an ephemeral, bounded browser object. It is **not** a new Blob record or part of `shared-state`.

```js
{
  schemaVersion: 1,
  weekStartKey: "2026-09-28",
  base: {
    scheduleVersion: 12,
    effectiveMealsByDate: { "2026-09-28": /* normalized full day */ }
  },
  constraints: {
    maxMinutesByDate: { "2026-09-29": 20 },
    excludedRecipeIds: [],
    targetDinnerCount: 5
  },
  days: [
    {
      dateKey: "2026-09-28",
      status: "suggested", // suggested | kept | unresolved
      recipeId: "recipe-id", // existing visible catalog ID only; empty if unresolved
      servingPlan: { adults: 2, kids: 2, guests: 0, extraServings: 0 },
      reasonCodes: ["family-favorite", "uses-home-food"],
      locked: false,
      needsRestrictionReview: false
    }
  ]
}
```

The implementation may refine field names, but the invariants are fixed: seven unique in-range dates; bounded arrays/strings; no private key, raw prompt, or entire recipe catalog in the draft; stable recipe IDs only; cloned base day records for conflict comparison; locked/kept slots not regenerated; `unresolved` as a valid outcome. The rule that a draft remains local means two devices may make different drafts, but only approved days become shared.

If reload recovery proves necessary, use `createHouseholdStorage()` with one new bounded local key and explicit expiry/schema tests. Document that change in `DATA_MODEL.md`. Do not persist drafts preemptively.

## Planning rules and limits

- Only recommend catalog recipes visible to that household. Missing catalog, recipe data, quantity, prep time, or restriction evidence is unknown—not permission to invent it.
- Existing explicit restrictions are exclusions. Current text-substring filtering is not a comprehensive allergen check. A recipe that cannot be confidently checked against a declared restriction needs a visible review state before approval; do not claim it is safe.
- Use favorites, dated outcomes, repeat spacing, prep-time evidence, serving plans, and advisory inventory matches for ranking. Missing inventory does not block planning and a likely name match never becomes a verified quantity.
- Planned extra servings are an intention; they do not create available leftovers until cooking is recorded. Do not make Tuesday depend on Monday's unconfirmed portions as if they exist.
- The draft engine is a pure function with deterministic tie-breaking. Its result and UI do not call OpenAI. A future user-triggered language adapter may populate allowed constraints, then pass through the same deterministic validation.
- Initial scope is dinner suggestions. Existing breakfast/lunch and approved school lunches remain visible and intact; no invented lunchbox components or prices.

## Approval contract

1. Snapshot the version and normalized effective day for every proposed date when the draft is made. Mark existing planned dinners as kept unless a person explicitly elects to replace one.
2. At approval, load the latest authoritative schedule. Compare each *target full day* with its base. A remote same-date edit, including breakfast or lunch, blocks that date for review. Unchanged remote dates may coexist with approved local dates.
3. Compose only explicitly approved dinner changes into each current normalized day; preserve its other items, notes, handoff, serving plans, and legacy aliases through existing normalizers. Write date overrides through the existing `schedule` endpoint with the observed version.
4. If the version changes during that write, stop and repeat the per-date conflict evaluation. Do not enter `saveSchedule()`'s current automatic local-wins retry for a draft approval.
5. Report each date as saved, unresolved, or pending. A local fallback is not proof of a completed remote save. A failed schedule save leaves shopping unchanged.
6. After confirmed schedule save, compute a shopping difference. Apply it only through a separate explicit action and the current versioned grocery path. If that save fails, say “Plan saved; shopping update pending” and retain a bounded retry action. Do not roll back a plan by overwriting another person's newer edits.
7. Repeated approval or grocery update must be idempotent. Checked/manual groceries are retained. A new required amount on a checked row is surfaced as additional need; old purchases are not silently undone when a plan changes.

The existing schedule, grocery, dinner-history, and family-state records remain separate. There is no transaction across them. All server writes retain household-key checks, scoped keys, bounded inputs, sanitization, and version conflicts.

## Change-of-plans contract

- Supported initial inputs: less preparation time and changed eater count. A no-cooking option may be a manual selection if available metadata cannot justify a suggestion.
- Preview affected dinner items, dates, serving calculations, and grocery difference. Never move a meal into an occupied or locked slot without choosing another destination.
- Cancel leaves all records untouched. Apply uses the same per-date conflict rule as week approval. Shopping is a subsequent reviewed action. Undo, if shown, must compare current versions/affected dates and fail closed on another edit.

## Screen sequence and visual states

| Screen | First answer | Primary action | Essential states |
|---|---|---|---|
| Today | What are breakfast, lunch, and dinner today? What needs one decision? | Cook, approve, or adjust as context warrants | empty, partial, planned, pending save, offline, conflict |
| Week draft | Which dinner is proposed for each date, and why? | Approve reviewed week | empty catalog, suggested, kept/locked, unresolved restriction, conflict |
| Change of plans | What specifically changes tonight and later? | Use this change | alternatives unavailable, occupied destination, pending, conflict, cancel |
| Family memory | Which preferences were stated and what outcomes actually support suggestions? | Edit preference or record dinner | no feedback, correction, derived reason, hidden/missing member |

All four screens use the accepted ivory/plum/tomato direction, plain-language labels, visible focus, 44px or larger controls, and a safe-area-aware bottom navigation. Today retains the canonical Breakfast → Lunch → Dinner reading order and the five destinations Today, Plan, Lunches, Shop, Library. The prior concept images are the bounded representative screens for this day; they do not establish real recipe timings, quantities, or finished accessibility behavior.

## Fixed verification scenarios for implementation

| ID | Starting condition | Required result |
|---|---|---|
| F01 | Empty household, reachable catalog | Draft offers known dinners or clearly unresolved slots; Today still names all three meal periods. |
| F02 | Catalog unavailable, local copy unavailable | No fabricated recipes; recovery/manual state remains usable. |
| F03 | Week contains breakfast, lunch, sides, notes, and a handoff | Dinner approval preserves all unrelated day content. |
| F04 | Two suggested dinners, one locked | Regeneration leaves the locked date unchanged. |
| F05 | No recipe fits a quick night | That date is unresolved; max time is not silently relaxed. |
| F06 | Declared restriction with ambiguous recipe ingredients, including Spanish text | No unsupported “safe” label; explicit review or unresolved slot. |
| F07 | Recipe has no verified prep time or yield | Unknown metadata is visible; any yield assumption is labeled and no invented time promise appears. |
| F08 | Inventory name matches but quantity is unknown | Suggest “check at home”; no silent grocery deduction. |
| F09 | Eater count rises after approval | Serving/batch and planned grocery amounts recalculate; a prior checked quantity does not cover the increase automatically. |
| F10 | Monday intends two extra servings, no actual cooking recorded | Tuesday cannot use a confirmed-leftover source; planned reuse remains conditional. |
| F11 | Device A edits lunch on Wednesday; device B approves an older Wednesday dinner draft | B stops for same-date review. A's lunch persists. |
| F12 | Schedule save succeeds, grocery save fails | UI reports both outcomes and offers finite shopping retry; no false all-synced state. |
| F13 | Offline approval on a phone, then reconnect | Local state is marked pending; household-scoped data and conflict resolution settle before shared success. |
| F14 | English/Spanish toggle at 360/390px | Controls stay readable, safety wording retains meaning, no horizontal overflow, bottom navigation clears content. |
| F15 | Dinner feedback edited twice for the same date | One event determines the current outcome; ranking does not count two independent dinners. |
| F16 | Different household opened on the same device | No prior household draft or fallback is read. |

The implementation test suite should use these scenarios as behavior checks where the outcome can be verified in code. Rendered mobile checks remain manual, bounded, and evidence-based. No new test harness is required.
