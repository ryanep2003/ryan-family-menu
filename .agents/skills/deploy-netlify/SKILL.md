---
name: deploy-netlify
description: Deploy approved Ryan Family Menu changes through the established GitHub main-to-Netlify production workflow, then verify that the intended release is live. Use only when the user explicitly asks to deploy, publish, push live, or ship waiting changes. Run the pre-deploy gate first, commit only the authorized scope, push main, and verify production rather than treating a successful push as completion.
---

# Deploy Netlify

Ship an approved release through the existing direct-to-production workflow. Do not redesign, add features, rotate secrets, or mutate household data during deployment.

## Confirm Scope and Authority

1. Read `AGENTS.md` and `docs/DEPLOYMENT.md`.
2. Confirm the canonical repository path and that the deployment target is GitHub `main` feeding the Ryan Family Menu Netlify production site.
3. Require an explicit user request to deploy. Approval to implement or test is not deployment authorization.
4. Inspect `git status`, the full diff, untracked files, current branch, and recent commits.
5. Exclude unrelated changes, backups, household exports, credentials, keys, tokens, temporary artifacts, and local environment files.

If the intended release scope is ambiguous or mixed with unrelated user work, stop and resolve the exact scope before staging.

## Pass the Release Gate

Use `$pre-deploy-check` and require `READY TO DEPLOY` before committing or pushing.

At minimum, verify:

- `npm test` passes;
- `git diff --check` passes;
- risk-specific browser, mobile/PWA, API, data, AI, security, and configuration checks are complete;
- no required migration, backup, secret, environment variable, or approval is unresolved;
- the release does not introduce runaway requests, polling, or broad media caching.

Do not weaken or skip a release blocker merely because deployment is urgent.

## Commit Intentionally

1. Stage only the reviewed release files.
2. Review the staged diff and staged file list.
3. Use a concise commit message describing the user-facing outcome or operating-system change.
4. Confirm the working tree contains no accidentally omitted release file and no accidentally staged private file.

Do not amend, rewrite history, reset, or discard user work unless explicitly requested.

## Push Main

Push the local `main` commit to `origin/main` using a non-interactive Git command. If authentication, branch protection, remote divergence, or permissions block the push, stop and report the exact blocker. Do not force-push.

The push triggers Netlify automatically; do not create a second manual deployment unless the established configuration is unavailable and the user approves the alternative.

## Verify Production

Wait for the Netlify release to become available, communicating if verification takes more than a minute.

Verify more than site availability:

1. Confirm the remote Git commit is the intended release.
2. Confirm a changed production asset or observable behavior matches that commit. Use an exact checksum or release-specific marker when practical.
3. Open the production site and exercise the affected flow when safe.
4. Inspect relevant console, module, CSP, service-worker, API, synchronization, and mobile behavior.
5. Confirm the app does not enter a repeated request or retry loop.

Never print or expose a household key while verifying production. Avoid production writes unless the requested release requires a safe, reversible smoke action in an authorized household.

If the live release fails, report it immediately with the evidence and safest rollback option. Do not overwrite production data. Revert or redeploy a known-good commit only when authorized by the user or an already-approved rollback plan.

## Report

Lead with whether deployment and production verification succeeded. Include:

- release commit;
- tests and release checks actually run;
- production evidence checked;
- remaining risk or verification gap.

Do not say the release is live merely because `git push` succeeded.
