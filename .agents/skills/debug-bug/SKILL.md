---
name: debug-bug
description: Diagnose Ryan Family Menu failures by reproducing the problem, tracing the relevant browser/server/storage flow, testing hypotheses, and making the smallest evidence-based fix when implementation is requested. Use for broken UI, sync loops, data loss, incorrect calculations, API errors, PWA/cache issues, AI import failures, or production regressions. Avoid shotgun changes and unrelated refactors.
---

# Debug Bug

Find the cause before changing code.

## Reproduce or Bound the Failure

1. Read `AGENTS.md` and the relevant architecture/data/AI/deployment document.
2. Capture the expected behavior, observed behavior, affected household/device/view, timing, and recent change when known.
3. Reproduce the failure using the smallest safe case. When reproduction is unavailable, derive a precise trace from screenshots, logs, code, and stored-state contracts.
4. Preserve the user's current data and unrelated working-tree changes.

If the user asks only for diagnosis, do not implement a fix without additional authorization.

## Trace the Flow

Follow the value or event from its origin through every relevant boundary:

- control and event handler;
- in-memory state and pure logic;
- rendering;
- household-scoped local storage;
- API request and household header;
- server access validation and sanitizer;
- Blob key/envelope/version;
- response application, conflict, retry, and offline behavior;
- service-worker cache where static code may be stale.

Inspect browser console errors, network behavior, Netlify logs/observability, or provider responses when available and authorized. Do not expose keys, secrets, or private household content.

## Test Hypotheses

List a small number of plausible causes in priority order. Seek evidence that distinguishes them; do not modify several areas at once hoping the symptom disappears.

Reduce the problem to a failing automated test when practical. For a production-only issue, reproduce against a local fixture or read-only observation before changing live state.

## Fix the Root Cause

1. Change the smallest appropriate layer.
2. Preserve backward compatibility and household isolation.
3. Add a regression test that fails for the original cause, not merely the visible symptom.
4. Avoid cleanup and refactors unrelated to the fix.
5. Update documentation only when the bug reveals a missing durable invariant or changes intended behavior.

## Verify

Run the new focused test, `npm test`, and `git diff --check`. Re-run the original user flow and inspect adjacent behavior. Include mobile, offline, persistence, API, AI, or PWA checks when relevant.

Confirm that retries are finite and request volume is normal when investigating synchronization or Netlify usage.

## Explain

Report in plain language:

- the root cause;
- why it produced the symptom;
- the smallest fix made, if authorized;
- regression checks actually performed;
- any remaining uncertainty or risk.
