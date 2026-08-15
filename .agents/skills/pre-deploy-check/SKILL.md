---
name: pre-deploy-check
description: Perform a final release-readiness assessment for meaningful Ryan Family Menu changes. Use before a requested deployment or when asked whether changes are safe to ship. Review scope, tests, browser/mobile behavior, API and data safety, PWA state, configuration, secrets, and production risk, then return exactly READY TO DEPLOY or NOT READY TO DEPLOY. Do not deploy as part of this skill unless separately requested.
---

# Pre-Deploy Check

Make a release decision from evidence, not from a successful test command alone.

## Establish Release Scope

1. Read `AGENTS.md` and `docs/DEPLOYMENT.md`.
2. Confirm the repository, branch, target environment, and intended release behavior.
3. Inspect `git status`, the complete diff, new files, and recent relevant commits.
4. Identify unrelated changes, generated artifacts, backups, credentials, household keys, or private configuration. Treat any secret exposure as a blocker.
5. Classify the release areas: UI, domain logic, household access, API, persisted data, AI, PWA, deployment configuration, or documentation only.

## Run Baseline Checks

Run:

```sh
npm test
git diff --check
```

Confirm whether the repository has build, lint, type-check, or CI commands before claiming them. It currently has only `npm test` as a package script.

## Apply Risk-Specific Checks

### UI or workflow

- Exercise the affected path in a real browser.
- Check desktop and a narrow mobile viewport.
- Inspect console errors, overflow, focus, touch targets, loading, empty, error, offline, and success states as applicable.
- Check English and Spanish when copy or layout changed.

### API, access, or security

- Verify method handling, household validation, household namespaces, bounded request parsing, sanitizer output, no-store responses, and safe failure order.
- Confirm no secrets are present in source, diff, logs, or client code.
- Review `netlify.toml` when routes, headers, caching, or rate limits changed.

### Persisted data

- Use `$safe-database-change` findings.
- Verify old/new record compatibility, local fallback, optimistic conflicts, IDs, ownership, migration readiness, and rollback implications.
- Block deployment when a required migration, backup, approval, or environment variable is unresolved.

### AI

- Verify household access, call count, model configuration, request/image limits, parsing, sanitization, manual/deterministic fallback, and provider error handling.
- Consider Netlify and OpenAI cost multiplication.

### PWA

- Confirm every first-party imported module is in the pre-cache.
- Confirm the cache version matches the `app.js?v=...` version.
- Test update/reload and offline reopening when static behavior changed materially.

## Review Regression Risk

Check the user flow immediately before and after the changed behavior. Look specifically for silent data removal, stale-client incompatibility, duplicate grocery generation, cross-household leakage, runaway requests, and mobile navigation obstruction.

If a relevant check cannot be performed, state the verification gap and decide whether it blocks this release based on impact. Do not convert uncertainty into a passing claim.

## Decision

Finish with exactly one heading:

## READY TO DEPLOY

Use only when the requested behavior and related flows are verified, relevant checks pass, configuration is ready, and no material blocker remains.

Or:

## NOT READY TO DEPLOY

List blocking findings in priority order, the evidence, and the minimum action required to clear each blocker.

Do not push, deploy, mutate production data, or change environment variables unless the user explicitly requests that separate action.
