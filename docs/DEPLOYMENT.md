# Development and Deployment

## Production Shape

- Repository: GitHub, branch `main`.
- Hosting: Netlify.
- Production site: `https://ryanfamilymenu.netlify.app`.
- Publish directory: repository root (`.`).
- Functions directory: `netlify/functions`.
- Build command: none.
- Deployment trigger: pushing a commit to `main`.

Netlify configuration, headers, asset caching, and the abnormal-traffic cap live in `netlify.toml`.

## Local Setup

Requirements:

- A current Node.js runtime with native `node:test`, Fetch API, `Request`, and `Response` support.
- npm.

Install dependencies:

```sh
npm install
```

Run automated tests:

```sh
npm test
```

There is no build, lint, type-check, or bundled development-server command in `package.json`. Static files can be served with a simple local HTTP server for UI inspection, but real household and Blob behavior requires Netlify Functions or a controlled mock. Do not open `index.html` through `file://`; module and service-worker behavior expects HTTP.

## Environment Configuration

Configure secrets in Netlify, never in tracked files.

| Variable | Required | Purpose |
|---|---|---|
| `HOUSEHOLD_CREATION_CODE` | Required to create households | Owner-issued invitation code for new household creation |
| `OPENAI_API_KEY` | Required for AI scans/translations | Server-side OpenAI project API key |
| `OPENAI_MODEL` | Optional | Overrides the default `gpt-5.4-mini` model |
| `LEGACY_MIGRATION_CODE` | Temporary only | Authorizes the one-time original-household migration |

`FAMILY_WRITE_TOKEN` is referenced by an unused legacy helper and its tests. Current shared endpoints use household-key access and do not consume this variable. Do not rely on it as production protection.

Netlify supplies Blob access to deployed Functions through `@netlify/blobs`; no database connection string is present in the repository.

## Pre-Deployment Checks

Use `$pre-deploy-check` for a meaningful release and require its `READY TO DEPLOY` decision. Use `$test-mobile-pwa` whenever the release affects visible mobile behavior, the app shell, or PWA state. At minimum:

Before a recovery or release-readiness review, run `npm run check:fresh-main`. It compares the local `HEAD` to live `origin/main`; a mismatch means the checkout is stale and must be refreshed in an isolated copy before conclusions are made. This check does not deploy or modify files.

1. Confirm the intended repository and `main` branch.
2. Review `git status` and the complete diff for unrelated or secret material.
3. Run `npm test` and `git diff --check`.
4. Apply the risk-specific checks in `AGENTS.md`.
5. For UI changes, exercise the changed flow on desktop and narrow mobile, and inspect console errors.
6. For persisted-data changes, verify old/new records, household isolation, local fallback, and conflicts.
7. For PWA changes, verify the service-worker cache list and cache/app version alignment.
8. For AI changes, verify access, size limits, parsing, failure behavior, and call count.
9. Confirm required Netlify environment variables are configured without printing their values.

Do not deploy with failing checks, unresolved data compatibility, missing environment configuration, or unreviewed destructive operations.

## Deploying

Use `$deploy-netlify` only after the user explicitly asks to deploy. The established production workflow is:

1. Commit the reviewed change intentionally.
2. Push `main` to GitHub.
3. Wait for Netlify to complete the production deploy.
4. Verify the live site or a release-specific asset/function—not merely the Git push.
5. Exercise the affected production flow without exposing household keys or private data.

A successful push is not sufficient evidence of a successful deployment.

## Production Verification

Choose checks appropriate to the release:

- Load the production app and confirm the household gate or saved-household opening works.
- Confirm the changed static asset matches the committed version.
- Inspect the browser console for module, service-worker, CSP, or runtime errors.
- Confirm mobile width has no accidental horizontal overflow.
- Verify any changed function returns expected unauthenticated and authenticated behavior.
- Confirm writes persist after reload and remain isolated to the active household.
- Confirm synchronization statuses settle instead of retrying indefinitely.
- Check Netlify deploy and function/traffic observability when the change affects infrastructure or request behavior.

## PWA Release Rules

When a first-party frontend module is added or removed:

- update `service-worker.js` `ASSETS`;
- increment `CACHE_NAME` when shipped static behavior changes;
- keep the `app.js?v=...` version in `index.html` aligned;
- run the service-worker tests;
- verify one update/reload cycle and, when relevant, an offline reopen.

Do not pre-cache all recipe photos. Large assets should remain on-demand.

## Data Changes and Migration

There is no general migration runner. Persisted JSON changes must use tolerant readers and additive writers as described in `DATA_MODEL.md`.

Before a production rewrite or deletion:

1. Identify exact Blob store names and household-scoped keys.
2. Verify a recoverable backup.
3. Test the migration against representative copies.
4. Define success checks and rollback.
5. Obtain explicit approval for the destructive production action.

The original-household migration is a special one-time copy path controlled by `LEGACY_MIGRATION_CODE`. Remove or unset that code after verification.

## Rollback

For a frontend/function regression, revert the release commit or redeploy a known-good commit through the established GitHub/Netlify workflow. Then verify the live asset and affected flow.

Code rollback does not automatically roll back Blob records. If a release wrote a new data shape, older code must already tolerate that shape or a separately approved data recovery may be required. This is why additive fields and backward-compatible readers are required before deployment.

Never restore all households from a backup or overwrite a broad store to fix one household without exact scope and approval.
