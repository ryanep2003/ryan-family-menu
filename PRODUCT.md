# Product

## Platform

web

## Users

Ryan Family Menu is for family members and caretakers who need a shared, always-available view of what food is in the house, what meals are planned, what groceries are needed, and how recipes should be prepared. The app needs to work well in the everyday conditions people actually use it in: on phones, in the kitchen, at the store, and during quick handoffs between people helping manage meals.

## Product Purpose

Family Menu is the shared operating system for a household's food life. It helps every family member plan every meal across the month, shop intelligently, manage food at home, use leftovers intentionally, and stay within budget with the least possible effort and waste. Success looks like a household being able to answer five questions quickly: what are we eating, what do we already have, what do we need to buy, what should we use soon, and what are we spending?

## Current Experience

The shipped product currently supports:

- Private household creation and shared access through a family key.
- A Today view for the current meal, available leftovers/snacks, household handoffs, tasks, favorites, and recent activity.
- Weekly and monthly planning across breakfast, lunch, and dinner.
- Flexible meal composition using mains, sides, salads, desserts, sauces, drinks, and other recipe roles.
- Per-meal serving plans for adults, children, and guests, with batch and leftover estimates.
- Intentional leftover recording and allocation to later meals.
- A shared recipe library with bundled and household recipes, local drafts, editing, favorites, and hiding/deletion overlays.
- Recipe creation from photos, public links, or manual entry.
- A grocery list generated from meal plans, with shared-ingredient aggregation, inventory coverage, meal/date attribution, and per-meal filtering.
- Home inventory by location, stock level, quantity, and expiration.
- Receipt capture and monthly grocery-budget tracking.
- Family profiles, food preferences, household rules, quick dinner feedback, dinner history, and deterministic recommendation ranking.
- English and Spanish interface/content support.
- Installable mobile PWA behavior and household-scoped offline fallbacks.

The product does not currently provide individual user accounts, verified identity, administrator roles, key recovery/rotation, calendar integration, push notifications, native iOS features, or automatic AI-generated meal plans.

## Primary Workflows

1. **Open a household:** create an invited household or enter the private family key on a new device.
2. **Plan food:** choose meals for a week or specific month date, compose each meal, adjust eaters, and estimate leftovers.
3. **Prepare and hand off:** use Today to see what is planned, what should be used soon, and who is helping.
4. **Shop:** build the grocery list from the plan, add manual items, account for inventory, and move purchased items home.
5. **Manage food at home:** track location, amount, stock, and expiration; scan photos for suggested items.
6. **Manage recipes:** browse, search, favorite, import, scan, edit, draft, and publish household recipes.
7. **Learn from dinner:** record a two-second outcome, optional individual reactions, and leftovers so later suggestions can improve.
8. **Track spending:** scan or record receipt totals and compare monthly grocery spending with the household target.

## Product Terminology

- **Household:** one isolated family data space opened with a private key.
- **Family key:** the household's bearer credential; everyone who possesses it has shared read/write access.
- **Meal period:** breakfast, lunch, or dinner.
- **Meal role:** a flexible part of a meal, such as main, side, salad, dessert, sauce, or drink.
- **Serving plan:** adults, children, and guests expected for one meal period.
- **Available food:** a leftover or snack that should be used soon.
- **Handoff:** optional coordination details that help another caretaker continue meal preparation.
- **Dinner pace:** quick, standard, or no-cooking guidance for an evening.
- **Family memory:** explicit preferences, household rules, dinner outcomes, and history used to rank suggestions.
- **Shared state:** the primary household record containing planning and collaboration data.

## Current Priorities

1. Validate the new household-memory loop through real daily use.
2. Improve recommendations only after enough dinner feedback exists to support trustworthy behavior.
3. Preserve multi-household isolation, predictable synchronization, mobile usability, and low infrastructure cost while the app expands to friends and family.
4. Improve budget and food-quantity accuracy before adding heavier AI or infrastructure.
5. Keep household learning transparent, correctable, and optional.

## Positioning

The simplest shared food-management system for families and caretakers, connecting meal planning, recipes, groceries, inventory, leftovers, spending, and household collaboration.

## Brand Personality

The product should feel amazing, intuitive, and fast. It should feel warm and capable rather than ornamental, with the sense that it is helping a real household stay coordinated instead of asking them to learn a complicated system.

## Anti-references

It should not feel corporate, stodgy, or old. Avoid the look and tone of enterprise SaaS dashboards, stiff admin tools, or dated family organizer software that feels heavy, cluttered, or over-explained.

## Design Principles

- Shared-first coordination: every important task should support multiple people staying aligned without extra explanation.
- Mobile-first usefulness: the primary experience should be fast, readable, and comfortable on phones before anything else.
- Bilingual by default: English and Spanish support should feel built in, not bolted on.
- Fast confidence over ceremony: common tasks should be quick to complete, with clear feedback and very little friction.
- Warm practicality: the interface should feel human and supportive without slipping into corporate polish or old-fashioned visual habits.
- Flexible before rigid: meals contain whatever a family actually serves; categories organize items but never limit them.
- Enter once, use everywhere: recipes, portions, plans, inventory, groceries, leftovers, and costs should share one connected source of truth.
- Progressive usefulness: families should receive value from partial use and should never need perfect inventory or budget data before planning a meal.

## Accessibility & Inclusion

The app should support bilingual English and Spanish use throughout the core experience. It should prioritize readable text, clear contrast, strong touch-target usability on mobile, and calm interactions that work for family members and caretakers with a wide range of technical comfort levels.
