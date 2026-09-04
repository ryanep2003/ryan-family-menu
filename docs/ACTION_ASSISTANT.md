# Family Menu Action Assistant

The Action Assistant is a confirm-to-write helper for common household food tasks. It is an action sheet, not a chat thread and not a new bottom tab.

Families open it from **Today** (“Help”, near Plan and shop) or **Plan** (“Help plan”, near week tools and the meal Save control). Shop is intentionally out of scope until a later phase.

Every write follows the same loop: choose a chip → review a structured preview → tap **Apply** / **Aplicar** → persist through the existing meal-plan or grocery save path. Occupied dinners are never overwritten. Inventory and school lunches are never deleted by these actions.

## Phase A — shipped in this release

Deterministic browser logic. No OpenAI call.

- **Plan next week:** propose dinners for empty dinner slots in the calendar week after this week’s Monday (the week Plan shows after Next week). Dates are local, not UTC. Occupied dinners in that week are left as they are.
- **Fill gaps this week:** the same empty-slot fill for remaining days of the current local week from today through Sunday.
- **Build / refresh shopping list:** preview how many planned items will be on the list from the next 7 local days, then rebuild planned groceries through the ordinary grocery save.
- **What’s for dinner today / tomorrow:** answer from the local calendar date (today stays today; tomorrow is the next local date) and offer Open meal or Cook. This path does not write.

The optional “ask in your own words” field is a Phase B stub. It shows “coming soon” and does not call a model or write data.

Recipe ranking reuses existing family memory (`rankedRecipes`). OpenAI is not used for Phase A ranking.

## Phase B — natural language

A typed request may eventually map onto the same chips (fill empty dinners, refresh shopping, look up tonight). Free text must still produce a structured preview and require Apply. It must not silently write, invent meals, or bypass household restrictions.

## Phase C — more household actions

Later chips may cover leftovers, inventory advice, or Shop-list help. New surfaces still use the sheet, still preview, and still write only through existing domain saves. Do not add a chat transcript or a sixth bottom tab.

## Phase D — learn from usage (documentation only)

Usage may later rank which chips, recipes, or days to propose first—for example, preferring actions a household actually applies, or dinners that were kept after a fill.

Learning may only change **suggestions**. It must:

- still show a preview;
- still require Apply / Aplicar;
- never silent-write a meal plan, grocery list, inventory, or lunch;
- never auto-redesign the week or replace occupied dinners;
- remain inspectable and correctable.

Phase D is not implemented in this release. Do not persist a usage-learning record until an explicit, reviewed data change lands.

## Safety

- Household key and household-scoped records are unchanged.
- Empty dinner means no dinner items. Breakfast, lunch, notes, and leftovers on the same day do not count as an occupied dinner, and filling dinner does not remove them.
- The 7-day horizon is a hard cap for Phase A fills.
- Grocery refresh uses `replacePlannedGroceries` so manual rows remain.
- English and Spanish interface keys stay in parity, including **Apply** / **Aplicar**.
