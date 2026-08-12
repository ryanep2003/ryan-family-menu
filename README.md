# Family Menu

Private, multi-household family dinner planner deployed on Netlify.

Current features:

- Weekly dinner schedule and monthly meal calendar
- Recipe library with built-in recipes plus shared recipe uploads
- Recipe photo scanning and recipe URL import
- Recipe editing, hiding/deleting from the family menu, and photo replacement
- Shared grocery list grouped by meal, with receipt scanning
- Home inventory tracking with shelf-photo scanning
- English / Spanish UI toggle and Spanish grocery item helper text
- Installable web app shell with a small offline cache

## Deploying

This folder is ready for Netlify. Use `.` as the publish directory and leave the build command blank.

After connecting this repo to Netlify, any pushed update should redeploy the Family Menu site automatically.

## Storage

Shared data is stored with Netlify Blobs from the functions in `netlify/functions/`. Every record is namespaced by a validated household ID, and every read and write requires that household's private key:

- `recipes.js`: shared uploaded recipes
- `family-state.js`: schedule, calendar meals, favorites, tasks, recipe edits, hidden/deleted recipes
- `groceries.js`: shared grocery list
- `inventory.js`: home inventory

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

Required Netlify environment variables:

- `OPENAI_API_KEY`: OpenAI project API key
- `OPENAI_MODEL`: optional; defaults to `gpt-5.4-mini`

Keep a small API billing limit while testing. Manual recipe, grocery, and inventory entry works without OpenAI configured.

## Maintenance Notes

- Keep `app.js` simple until it is split by domain; avoid adding new framework dependencies.
- Do not precache every recipe photo in `service-worker.js`; large assets should be cached on demand.
- Prefer small sanitizer/test additions when changing Netlify functions.
