# Ryan Family Menu

Private, multi-household food planning and coordination app deployed on Netlify.

Current features:

- Today dashboard for meals, food to use soon, handoffs, tasks, and activity
- Weekly and monthly breakfast, lunch, and dinner planning
- Flexible meal composition with mains, sides, salads, desserts, sauces, and more
- Adult, child, and guest serving plans with batch and leftover estimates
- Recipe library with built-in recipes plus shared recipe uploads
- Recipe photo scanning and recipe URL import
- Recipe editing, hiding/deleting from the family menu, and photo replacement
- Shared grocery generation from meal plans, with receipt scanning
- Home inventory tracking with quantities, expiration, and shelf-photo scanning
- Receipt history and monthly grocery-budget tracking
- Family profiles, preferences, household rules, dinner feedback, and meal history
- English / Spanish UI toggle and Spanish grocery item helper text
- Installable web app shell with a small offline cache

## Repository Guide

- `AGENTS.md`: permanent Codex operating manual and safety rules
- `PRODUCT.md`: product purpose, current workflows, terminology, and priorities
- `DESIGN.md`: visual system and interaction guidance
- `docs/ARCHITECTURE.md`: system components and data flow
- `docs/DATA_MODEL.md`: persisted records and compatibility rules
- `docs/AI.md`: OpenAI integrations, prompts, fallbacks, and cost-sensitive paths
- `docs/DEPLOYMENT.md`: local setup, configuration, deployment, verification, and rollback
- `docs/DECISIONS.md`: durable decisions that should not be accidentally reversed

Repository-specific Codex workflows live in `.agents/skills/`. The current set covers feature work, root-cause debugging, UI review, safe data changes, pre-deployment assessment, mobile/PWA testing, and verified Netlify deployment.

## Development

Install dependencies and run the full automated suite:

```sh
npm install
npm test
```

The frontend has no compilation or bundling step. Netlify publishes the repository root directly and serves serverless functions from `netlify/functions/`.

## Deploying

This folder is ready for Netlify. Use `.` as the publish directory and leave the build command blank.

After connecting this repo to Netlify, any pushed update should redeploy the Family Menu site automatically.

## Storage

Shared data is stored with Netlify Blobs from the functions in `netlify/functions/`. Every record is namespaced by a validated household ID, and every read and write requires that household's private key:

- `recipes.js`: shared uploaded recipes
- `family-state.js`: schedule, calendar meals, favorites, tasks, recipe edits, hidden/deleted recipes
- `groceries.js`: shared grocery list
- `inventory.js`: home inventory
- `dinner-history.js`: meal feedback and dinner history

The browser also keeps household-scoped local fallbacks in `localStorage` so the app remains usable if a live save fails without showing another household's cached data.

## Household Setup

Before deploying the multi-household version, set this required Netlify environment variable:

- `HOUSEHOLD_CREATION_CODE`: invite code the site owner gives to a new family when they are allowed to create a household

Each household receives a random family key during setup. The key is shown once, is stored on that browser, and must be shared privately with other household members. Possession of the key grants read and write access to that household.

Use a long, unique `HOUSEHOLD_CREATION_CODE` and rotate it after onboarding a new family. Household members can copy their household key later from the Household menu.

### Migrating the original household data

Set a one-time `LEGACY_MIGRATION_CODE` in Netlify. An owner can then create the first household through the `households` function with `migrateLegacy: true` and that code. The legacy records are copied into the new namespace; the public setup screen never exposes this option. Remove `LEGACY_MIGRATION_CODE` after verifying the copy.

Do not deploy this version before setting `HOUSEHOLD_CREATION_CODE`: household creation intentionally fails closed when it is absent.

## OpenAI-Powered Scanning

Photo and URL parsing use the OpenAI API from Netlify functions:

- `recognize-recipe.js`
- `recognize-receipt.js`
- `recognize-inventory.js`
- `import-recipe-url.js`
- `translate-recipe.js`

Required Netlify environment variables:

- `OPENAI_API_KEY`: OpenAI project API key
- `OPENAI_MODEL`: optional; defaults to `gpt-5.4-mini`

Keep a small API billing limit while testing. Manual recipe, grocery, and inventory entry works without OpenAI configured.

URL imports parse Recipe JSON-LD before using AI. `OPENAI_MODEL` is optional and defaults to `gpt-5.4-mini`.

## Maintenance Notes

- Keep `app.js` simple until it is split by domain; avoid adding new framework dependencies.
- Do not precache every recipe photo in `service-worker.js`; large assets should be cached on demand.
- Prefer small sanitizer/test additions when changing Netlify functions.
- Read `AGENTS.md` and the relevant document in `docs/` before changing persisted data, household access, AI behavior, synchronization, or deployment.
