# Ryan Family Menu

Private family dinner planner deployed on Netlify.

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

After connecting this repo to Netlify, any pushed update should redeploy the Ryan Family Menu site automatically.

## Storage

Shared data is stored with Netlify Blobs from the functions in `netlify/functions/`:

- `recipes.js`: shared uploaded recipes
- `family-state.js`: schedule, calendar meals, favorites, tasks, recipe edits, hidden/deleted recipes
- `groceries.js`: shared grocery list
- `inventory.js`: home inventory

The browser also keeps local fallbacks in `localStorage` so the app remains usable if a live save fails.

## Optional Family Write Token

By default, write endpoints stay open to preserve the current frictionless family workflow.

For basic write protection, set this Netlify environment variable:

- `FAMILY_WRITE_TOKEN`: shared secret required for writes and AI-powered imports/scans

Then set the same value in the browser once:

```js
localStorage.setItem("dinner-family-write-token", "your-shared-secret")
```

Reload the app after setting it. Reads remain public unless Netlify site-level access controls are configured.

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
