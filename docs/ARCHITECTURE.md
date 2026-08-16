# Architecture

## Plain-English Overview

Ryan Family Menu is a website that behaves like an installable phone app. The browser loads a static HTML page and native JavaScript modules. Those modules keep a working copy of the household menu in memory and a household-specific fallback in browser storage. Netlify Functions read and write the shared copy in Netlify Blobs.

There is no React application, traditional server, SQL database, or compilation step. This simplicity is intentional, but it means the contracts between browser state, Blob records, server sanitizers, translations, and the service worker must stay coordinated manually.

## System Flow

```text
GitHub main
  -> Netlify deploys repository root
  -> Browser loads index.html, styles.css, and app.js
  -> household-access.js opens or creates a household session
  -> app.js renders household-scoped local fallbacks immediately
  -> browser requests recipes, shared state, dinner history, groceries, and inventory
  -> Netlify Functions validate x-household-key
  -> functions read/write household-scoped Netlify Blob records
  -> AI functions call OpenAI only after household validation
```

## Frontend

### App shell and coordination

- `index.html`: household gate and all main views.
- `app.js`: application bootstrap, in-memory state, persistence orchestration, navigation, shared rendering, and domain-module composition.
- `styles.css`: design tokens, component styling, responsive layout, PWA-safe bottom navigation, and motion preferences.
- `translations.js`: English and Spanish interface strings. Both languages must expose the same keys.
- `DESIGN.md`: authoritative visual and interaction guidance.

`app.js` waits for `requireHouseholdSession()` before initializing household state. It reads household-scoped browser fallbacks, creates the domain UI modules, renders, then loads remote collections asynchronously.

### Domain modules

| Domain | Logic and state | Rendering and interaction |
|---|---|---|
| Today and handoffs | `available-food.js`, `activity-logic.js`, `family-state.js` | `dashboard-ui.js`, `handoff-ui.js`, `activity-ui.js` |
| Meal planning and leftovers | `schedule-utils.js`, `recipes-data.js`, `recipe-utils.js` | `schedule-ui.js` |
| Cook Along and dinner memory | `memory-logic.js`, recipe steps | `cook-along-ui.js`, `app.js` |
| Household memory | `memory-logic.js`, `family-state.js` | `family-ui.js`, Today feedback in `app.js` |
| Groceries | `grocery-logic.js`, versioned collection helpers | `grocery-ui.js` |
| Inventory | `inventory-logic.js`, versioned collection helpers | `inventory-ui.js` |
| Budget and receipts | `budget-logic.js`, shared family state | `budget-ui.js`, `receipt-ui.js` |
| Recipes | `recipe-utils.js`, `recipes-data.js`, local drafts | `recipe-library-ui.js`, `recipe-form-ui.js` |
| Household access | `household-access.js`, `api.js` | household gate in `index.html` |
| PWA lifecycle | `app-lifecycle.js`, `storage-utils.js`, `sync-status.js` | install/update/status controls |

The split between `*-logic.js` and `*-ui.js` is a preferred pattern. Keep business rules in pure functions where possible and let UI factories receive their dependencies from `app.js`.

## Backend

The serverless endpoints are in `netlify/functions/`:

| Endpoint | Methods | Responsibility |
|---|---|---|
| `households` | GET, POST, PUT | Open, create, or rename a household; optional legacy migration |
| `family-state` | GET, PUT | Schedule, calendar, favorites, tasks, available food, budget, activity, family memory, recipe edits, and deletions |
| `dinner-history` | GET, PUT | Versioned dinner feedback/history |
| `groceries` | GET, PUT | Versioned shared grocery list |
| `inventory` | GET, PUT | Versioned shared inventory |
| `recipes` | GET, POST | Shared recipe index and recipe records |
| `recognize-recipe` | POST | Extract a recipe from images with OpenAI |
| `recognize-receipt` | POST | Extract receipt metadata and items with OpenAI |
| `recognize-inventory` | POST | Extract inventory candidates from images with OpenAI |
| `import-recipe-url` | POST | Import structured recipe data; use OpenAI only as fallback |
| `translate-recipe` | POST | Translate recipe content with OpenAI |

Shared server helpers:

- `_household.js`: key format, hashing, profile lookup, access validation, and household record namespacing.
- `_http.js`: no-store JSON responses and bounded JSON request parsing.
- `_versioned-record.js`: compatibility envelope and optimistic version checks.
- `_openai.js`: AI response extraction and common error messages.
- `_auth.js`: legacy/unused optional write-token helper; current household endpoints rely on household access instead.

## Persistence and Synchronization

Netlify Blobs is the production source of shared household data. The browser keeps household-scoped local fallbacks so the app can open and preserve pending work during transient failures.

Shared state, groceries, inventory, and dinner history use optimistic versions. A client submits the version it last read. If another device has already written a newer version, the server returns `409` and the newest server copy. This prevents silent overwrites but does not merge simultaneous edits field by field.

Shared menu and grocery conflicts now perform a small three-way merge before retrying: unchanged fields from the newest server copy are retained, while local edits and deletions are replayed. When a phone returns to the foreground, it refreshes shared menu and grocery data (throttled to avoid request loops); there is intentionally no continuous polling.

Shared recipes use an index plus individual recipe records. Published recipes are appended through `POST`; recipe edits and hidden/deleted IDs are stored in family state. Unpublished drafts remain local to the browser.

See `DATA_MODEL.md` before changing any persisted shape.

## Household Access

This is capability-key access, not a conventional login:

1. Creating a household requires `HOUSEHOLD_CREATION_CODE`.
2. The server generates a random `fm_...` key and a UUID household ID.
3. Only a SHA-256 digest of the key is stored with the household profile.
4. The browser stores the raw key in `localStorage` and sends it as `x-household-key`.
5. Possession of the key grants full household read/write access.

There are no individual accounts, roles, password recovery, key rotation, or revocation. `updatedBy` is useful attribution, not verified identity.

## AI and External Requests

The AI functions call `https://api.openai.com/v1/responses`. URL import also fetches public recipe pages and optionally their lead image. It blocks obvious local/private hosts, limits redirects, times out requests, and caps downloaded content.

See `AI.md` for models, prompts, sanitization, and cost-sensitive paths.

## PWA and Offline Behavior

- `manifest.webmanifest` defines the installed app identity and icons.
- `app-lifecycle.js` handles installation guidance and service-worker updates.
- `service-worker.js` caches the static shell and first-party modules, skips function requests, caches additional same-origin static assets on demand, and falls back to `index.html` on offline navigation.
- The cache name and `app.js?v=...` query version are intentionally tested as a pair.
- Recipe photos should not all be pre-cached; large media is cached only when requested.

Offline static assets do not make Netlify Functions available offline. Local fallbacks preserve usable browser state until synchronization can resume.

## Hosting and Security Boundaries

`netlify.toml` publishes the repository root, exposes `netlify/functions`, defines browser security headers, caches `/assets/*`, and rate-limits clearly abnormal traffic to 180 requests per minute per IP/domain.

The current Content Security Policy keeps scripts, styles, images, and connections same-origin except for inline data/blob images. OpenAI credentials exist only in the Netlify environment and server functions.

## High-Change-Surface Files

- `app.js`: application wiring and most shared workflow orchestration.
- `netlify/functions/family-state.js`: the largest persisted record sanitizer.
- `schedule-utils.js` and `schedule-ui.js`: canonical meals, legacy compatibility, portions, and leftovers.
- `grocery-logic.js`: quantity aggregation, inventory coverage, and generation idempotency.
- `translations.js`: every interface string in both languages.
- `service-worker.js`: manual static module list.

Inspect all related layers before changing these files. Prefer incremental extraction over a broad rewrite.
