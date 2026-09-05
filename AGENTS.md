# Ryan Family Menu Operating Manual

## Product

Ryan Family Menu is a private, multi-household food-planning web app for families and caretakers. It connects meal planning, recipes, serving estimates, leftovers, grocery shopping, home inventory, receipts, budgets, household preferences, and dinner feedback in one shared mobile-first experience.

The primary users are household members with mixed technical comfort. Common actions must remain fast on a phone, understandable without training, and useful even when a family uses only part of the system.

Read these sources before making product or visual decisions:

- `PRODUCT.md`: product purpose, users, principles, and current priorities.
- `DESIGN.md`: visual system, responsive rules, accessibility expectations, and interaction patterns.
- `docs/ARCHITECTURE.md`: components, request flow, storage, and authoritative files.
- `docs/DATA_MODEL.md`: persisted records, compatibility rules, and dangerous changes.
- `docs/AI.md`: AI-powered flows, prompts, limits, fallbacks, and cost risks.
- `docs/DEPLOYMENT.md`: development, configuration, deployment, verification, and rollback.
- `docs/DECISIONS.md`: durable decisions that should not be unknowingly reversed.

Do not invent functionality that is not present in the repository. Keep current product documentation aligned with shipped behavior.

## Architecture

- Frontend: framework-free HTML, CSS, and native JavaScript modules. `index.html` is the app shell, `app.js` coordinates state and domain UI modules, and `styles.css` supplies the shared visual system.
- Backend: Netlify Functions in `netlify/functions/`.
- Persistence: household-scoped JSON records in Netlify Blobs, plus household-scoped `localStorage` fallbacks and local recipe drafts.
- Access: possession of a high-entropy household key grants read/write access. The browser sends it as `x-household-key`; the server stores only its SHA-256 digest.
- AI: OpenAI Responses API through server functions. The model defaults to `gpt-5.4-mini` and can be overridden with `OPENAI_MODEL`.
- Deployment: pushes to GitHub `main` trigger Netlify production deployment. The repository is published directly; there is no frontend build step.
- Tests: Node's built-in test runner through `npm test`.
- PWA: `manifest.webmanifest`, `service-worker.js`, app icons, install handling, a static offline cache, and local fallbacks.

The browser and server normalizers are authoritative for persisted data—not example objects in tests or old prose. See `docs/ARCHITECTURE.md` for the file map and `docs/DATA_MODEL.md` for record ownership.

## Critical Invariants

Treat these as release blockers unless a requested, reviewed migration explicitly changes them:

1. Every shared endpoint must validate a household key before reading configuration-sensitive data or touching storage.
2. Every household record must use `householdDataKey(householdId, key)` or an equivalent household-scoped namespace.
3. Browser fallback keys must stay inside `createHouseholdStorage`; never allow one household to read another household's cached data.
4. Do not change Blob store names, record keys, version envelopes, local-storage keys, IDs, or field meanings silently.
5. Preserve legacy meal fields and compatibility normalization until an explicit migration removes the need for them.
6. Changes to persisted fields must update browser normalization, server sanitization, local persistence, tests, and documentation together.
7. Preserve version-conflict behavior for shared state, groceries, inventory, and dinner history. Do not overwrite production state to avoid a conflict.
8. Grocery generation must remain idempotent and must scale quantities when servings or batches change.
9. English and Spanish translation keys must remain in parity. Never silently substitute untranslated safety content.
10. When adding or removing a first-party frontend module, update the service-worker pre-cache and its tests. Keep the cache version aligned with the app-shell script version.
11. Do not introduce polling, rapid retries, or broad asset pre-caching. Netlify bandwidth and function usage are cost-sensitive.
12. Never expose household keys, creation codes, API keys, tokens, production Blob contents, or private backup data.

## Development Principles

- Understand the existing implementation before replacing it.
- Prefer improving the current architecture over introducing a new system.
- Do not rewrite working systems merely because another approach looks cleaner.
- Avoid unnecessary dependencies and build tooling.
- Preserve backward compatibility unless the requested feature explicitly requires otherwise.
- Keep implementations simple enough for future agents and a nontechnical product owner to understand.
- Never silently remove functionality or change data semantics.
- Treat production data, household access, synchronization, and authentication changes as high risk.
- Prefer additive data changes and tolerant readers.
- Avoid destructive database or Blob operations unless the product owner explicitly approves the exact target and recovery plan.
- Preserve unrelated user changes in a dirty working tree.

## Before Making Changes

For recovery, review, or release-readiness work based on current product behavior, run `npm run check:fresh-main` first. It compares the checkout `HEAD` with live `origin/main` and must pass before making baseline-sensitive claims. If it fails, fetch and create a fresh isolated checkout; never reset a dirty user checkout to repair freshness.

For meaningful features, persisted-data changes, or architectural work:

1. Inspect the relevant UI, state, logic, endpoint, sanitizer, persistence, localization, and tests.
2. Trace the current user and data flow end to end.
3. Identify compatibility requirements, affected households, likely regressions, and cost/security implications.
4. State a short implementation plan.
5. Implement the smallest coherent change.

For a small, obvious fix, inspect the affected path and proceed without unnecessary planning ceremony.

Use the repository skills when they match the task:

- `$build-feature`
- `$debug-bug`
- `$ui-review`
- `$safe-database-change`
- `$pre-deploy-check`
- `$test-mobile-pwa`
- `$deploy-netlify`

## Testing Rules

Never claim a check passed unless it was actually run.

For any JavaScript behavior change, run:

```sh
npm test
```

Also run `git diff --check` before committing. There is currently no build, lint, type-check, or automated browser command; do not imply those checks exist.

Apply additional verification based on risk:

- UI changes: exercise the affected flow in a real browser, inspect narrow mobile layout, keyboard/focus behavior, loading/error/empty states, and console errors.
- API changes: verify method handling, household access, bounded request parsing, sanitization, response shape, and failure behavior.
- Data changes: test old records, new records, round-trip persistence, conflicts, local fallback, and any migration path.
- AI changes: test sanitization and parsing without exposing secrets; verify useful manual or deterministic fallback behavior where applicable.
- PWA changes: use `$test-mobile-pwa` to verify the cache-version test, pre-cache module graph, update behavior, and offline reopening where relevant.
- Deployment changes: follow `docs/DEPLOYMENT.md`, require `$pre-deploy-check`, and use `$deploy-netlify` only after explicit deployment authorization.

If repository coverage is inadequate for the change, say so and add focused regression protection where practical. Do not build a large testing system without discussing it first.

## Definition of Done

A task is complete only when:

- the requested behavior works;
- related existing behavior still works;
- relevant automated and manual checks pass;
- errors, empty states, and offline behavior are handled where applicable;
- mobile and bilingual behavior are considered;
- household isolation and existing data remain safe;
- the implementation follows current design and architecture patterns;
- unnecessary code and dependencies were not introduced;
- architecture, data, AI, deployment, product, or decision documentation is updated when materially affected.

Do not deploy unless the user explicitly asks for deployment. A successful push is not proof of a successful Netlify deployment; verify the production result.

## Communication

At the end of meaningful work, report concisely:

- **What changed:** plain English.
- **Why:** the reasoning behind the implementation.
- **What you tested:** only checks actually performed.
- **Anything to know:** risks, limitations, data implications, or follow-up decisions.

Lead with the outcome and explain technical details in language suitable for a nontechnical product owner.
