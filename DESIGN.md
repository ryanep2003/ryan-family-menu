---
name: Ryan Family Menu
description: The Living Almanac — a quiet, shared record of a family's food life.
---

# Design System: The Living Almanac

## Product point of view

Ryan Family Menu is organized around what the family is eating, what happened before, and what should happen next—not a set of administrative features. The interface should feel observant, intimate, calm, and exact. Ordinary family content must look considered without requiring perfect recipe photography.

The current implementation applies this direction to the connected Today → Plan → Recipe → Shop slice. Other surfaces retain functional compatibility until their dedicated redesign.

## Tokens

| Role | Value |
| --- | --- |
| Ground | #F1F2EE |
| Paper | #FFFFFF |
| Ink | #171916 |
| Secondary text | #62675F |
| Rules | #D7DAD2 |
| Primary action | #2947B8 |
| Memory | #DDE6A9 |
| Attention | #C85F36 |
| Success | #3E6B52 |
| Restriction / danger | #A33A35 |

Use the eight-step spacing scale only: 4, 8, 12, 16, 24, 32, 48, and 64px. Geometry is square by default; controls use 8px radius and temporary sheets or media use 16px. There are no resting shadows. Elevation is reserved for real temporary overlays.

Core views use related page washes derived from this palette: morning sage for Today, warm parchment for Plan, cool mineral for Shop, and an apricot-to-olive archive wash for Library. Within a view, broad shaded chapters may distinguish the immediate meal, reflection, next action, and quieter household tools. These chapters use soft gradients and filled color fields rather than decorative lines, isolated badges, or a collection of cards. They create atmosphere and reading rhythm; they must not replace labels, encode navigation, or introduce a separate color system for each feature.

## Typography

Use the system sans stack for control, data, navigation, instructions, and labels. Use the editorial serif stack (Iowan Old Style, Palatino, Georgia fallback) for page, recipe, and story headings.

Default to sentence case. Hierarchy comes from scale, placement, contrast, and whitespace rather than uppercase or heavy weight. Quantities, dates, servings, timers, and money should use tabular numerals when a surface displays them.

## Layout and interaction

- Mobile is the primary design surface. The header is deliberately compact and the four core destinations sit in a safe-area-aware bottom bar: Today, Plan, Shop, Library.
- Desktop increases measure and breathing room; it does not turn the mobile composition into a dashboard.
- Prefer flat lists and rules over nested rounded cards.
- One action may be visually primary in a task. For a recipe that action is Cook; adding ingredients to shopping is secondary.
- Advanced planning, house maintenance, and history use progressive disclosure or live below the primary task—not in its first decision.
- A temporary action bar may be sticky when saving the focused day plan or finishing a shopping trip.

## Temporal grammar

The Living Almanac composes household food around time rather than feature categories:

- **Past:** one or two factual memories that explain what happened before. These read as part of the family record, not as a colored insight component.
- **Before:** the next preparation or handoff that makes tonight easier.
- **Tonight:** the meal, the people eating, and the amount being made. This is the visual and emotional center.
- **After:** what tonight creates for tomorrow, such as planned extra servings or a covered lunch.

Not every state needs all four moments. Empty and low-history states remain quiet instead of filling the page with placeholders.

Today opens on the meal, memory, and next practical action. `Today → Plan dinner` is a focused decision flow containing only dinner choice, eaters, serving adjustments, optional extras, optional handoff, and save. Comprehensive week and month planning remain a separate Plan destination.

Recipe detail owns its page as a working document; library statistics and management chrome disappear while reading. Shopping begins with the physical list and groups meal provenance once when possible. Receipt, budget, inventory, and bulk tools remain available but recede from the recipe-to-shopping task.

## Family memory

Memory cues are embedded facts, never an AI gimmick. They may state only what stored records support, such as a last-made date or a recorded household response. The UI never labels these facts AI insight, uses sparkles, or invents preferences.

## Accessibility and resilience

Keep semantic elements, 44px minimum touch targets, visible focus, English/Spanish parity, reduced-motion support, and existing offline/sync behavior. Do not trade a stable local/shared state for a prettier transient screen.

## Implementation rules

1. Keep styles.css ordered as tokens, foundation, primitives, shell/navigation, screen layouts, responsive rules, then state/interaction.
2. Preserve behavior hooks and IDs while changing presentation.
3. Add a view-model selector only when it keeps persisted/domain state out of rendering decisions.
4. Do not introduce generic food placeholders. A photo-less recipe must still look deliberate.
5. Do not use color as section navigation; color communicates action, memory, or semantic state.
