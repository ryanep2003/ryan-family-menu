# Recipe Wheel Search Architecture

## Goal

Replace the flat browse-all recipe result presentation with an experimental horizontal 3D recipe wheel while preserving the existing recipe search, category filtering, recipe detail, favorites, planning, localization, and persistence behavior.

The selected recipe appears front-and-center. Adjacent recipes sit to the left and right, slightly rotated, scaled down, and pushed back in depth so the result set feels like a horizontal circular carousel. Swiping left or right rotates the wheel one recipe at a time.

## Product constraints

- Search semantics do not change. The existing text query and category filter remain authoritative.
- Category narrowing remains available for All, Mains, Sides, Salads, Sauces, Desserts, and Drafts.
- No persisted recipe fields, household state, backend APIs, Blob keys, local-storage keys, or recipe normalization change.
- Recipe detail remains the existing detail surface.
- Family Picks remains separate from the wheel in this first experiment.
- Mobile-first. Pointer, touch, keyboard, reduced-motion, and empty-result states must remain usable.
- English and Spanish behavior must remain unchanged; no new user-facing copy is required for the first implementation.
- No new dependency or build tooling.

## Component boundary

The experiment belongs inside `recipe-library-ui.js`, because that module already owns:

1. the filtered recipe array,
2. browse-card markup,
3. search and category event handling,
4. recipe-open behavior.

The wheel is therefore a presentation/state enhancement over the existing filtered result set rather than a new search subsystem.

## State

Add ephemeral UI-only state inside `createRecipeLibraryUi`:

- `wheelIndex`: active filtered-result index.
- pointer gesture state: start X, start Y, active pointer id, and whether a horizontal drag has committed.

This state is never persisted.

When search text or category changes, reset `wheelIndex` to zero so the first matching recipe becomes the focal card. If the result count shrinks, clamp the index.

## Rendering model

Continue producing the same recipe browse cards and the same `data-open` recipe actions. After `#recipeList` receives filtered result markup:

- mark the list as wheel-enabled when two or more results exist;
- assign every card a signed offset from the active index;
- only keep the nearest few cards visually prominent;
- apply CSS custom properties / inline transform values for X position, Z depth, scale, rotation, opacity, and stacking order;
- expose the active card with `aria-current="true"` and make off-center cards less prominent to assistive technology only where doing so does not remove access to results.

Geometry should approximate a horizontal ellipse rather than a literal full 360-degree cylinder. A practical mapping for signed offset `d` is:

- `x = clamp(d, -3, 3) * cardSpacing`
- `z = -abs(d) * depthStep`
- `rotateY = -d * angleStep`
- `scale = 1 - min(abs(d), 3) * scaleStep`
- opacity falls gradually after the immediate neighbors.

This produces the visual impression of a circular wheel without requiring WebGL or a 3D library.

## Interaction

### Swipe / drag

Use Pointer Events on `#recipeList`.

- Horizontal displacement greater than a threshold advances one card.
- Vertical movement wins when it clearly exceeds horizontal movement, preserving page scroll.
- Release without threshold snaps back to the current card.
- One gesture advances at most one result in the first version; this prevents accidental skipping on mobile.

### Keyboard

When the wheel/list has focus:

- Left Arrow: previous recipe.
- Right Arrow: next recipe.
- Home: first recipe.
- End: last recipe.

Opening a recipe continues to use the existing card button behavior.

### Reduced motion / fallback

For `prefers-reduced-motion: reduce`, disable animated 3D transitions and present the results as a straightforward horizontally scrollable snap row. If Pointer Events or 3D transforms are unavailable, the underlying browse cards remain usable.

## Styling

Prefer CSS-only 3D transforms (`perspective`, `translate3d`, `rotateY`, `scale`) and compositor-friendly properties. Do not animate layout properties such as width/left/top.

Keep the active card large enough for recipe image, category, title, metadata, and the existing Add to meal action. Adjacent cards act as visual previews, not miniature full-detail surfaces.

Desktop can show a broader arc; narrow phones should show the active card plus visible shoulders of the previous and next cards.

## Performance

- No WebGL, canvas, physics library, or dependency.
- No backend requests caused by wheel movement.
- Continue lazy image loading.
- Update transforms only for rendered cards; avoid request loops and polling.
- Keep DOM cardinality identical to the current filtered result count for the first implementation.

## Safety / regression boundary

Must not change:

- recipe filtering logic;
- localization fallback logic;
- recipe IDs;
- favorite/planned logic;
- add-to-meal behavior;
- recipe detail behavior;
- recipe catalog loading/unavailable/empty states;
- storage or API calls.

## Test plan

Automated:

- existing `npm test` suite remains green;
- add focused pure tests only if wheel math is extracted into a pure helper.

Manual preview:

1. Open Library on a narrow mobile viewport.
2. Verify All category and text search.
3. Swipe left/right through recipes.
4. Change category to Dessert and Salad and verify the wheel resets to the first filtered result.
5. Search within a category and verify count and cards agree.
6. Open the active recipe; back returns focus to its originating card.
7. Verify Add to meal still works.
8. Verify one-result and zero-result states.
9. Verify keyboard Left/Right/Home/End.
10. Verify reduced-motion fallback.
11. Check console for errors.
12. Check English and Spanish.

## Rollout

Implement only on `feature/recipe-wheel-search` and expose through the branch/PR preview. Do not merge or deploy to production until the product owner reviews the visual behavior.
