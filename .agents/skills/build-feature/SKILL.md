---
name: build-feature
description: Implement a new Ryan Family Menu feature safely inside the existing architecture. Use for requests to add or extend product behavior across the frontend, Netlify Functions, household data, AI flows, PWA, or shared workflows. Do not use for a diagnosis-only request, a UI critique without implementation, or a deployment-only check.
---

# Build Feature

Implement the requested behavior without redesigning unrelated parts of Ryan Family Menu.

## Establish Context

1. Read the root `AGENTS.md`.
2. Read `PRODUCT.md` and only the relevant documents in `docs/`.
3. Restate the user outcome in plain language and distinguish requested behavior from optional ideas.
4. Inspect the current implementation before proposing a replacement.

## Trace the Existing Flow

Locate every affected layer that applies:

- app shell and controls in `index.html`;
- orchestration and state in `app.js`;
- domain logic and UI factories;
- client normalization and local persistence;
- Netlify endpoint and server sanitization;
- Netlify Blob record and version behavior;
- English and Spanish translations;
- service-worker pre-cache;
- related tests and documentation.

Identify compatibility, household-isolation, synchronization, mobile, offline, cost, and security consequences. If persisted data changes, also use `$safe-database-change`.

## Plan

State a short plan for meaningful work. Prefer the smallest coherent implementation that follows existing patterns. Avoid new dependencies, frameworks, services, and generalized abstractions unless the current design cannot meet the request simply.

Do not silently remove behavior or change field meanings. Preserve legacy readers and current household records unless an approved migration explicitly says otherwise.

## Implement

1. Put business rules in a pure logic module when practical.
2. Keep UI modules dependent on injected state/actions rather than hidden global state.
3. Bound and sanitize every new server input.
4. Keep browser and server normalization aligned for persisted fields.
5. Add both English and Spanish interface strings.
6. Preserve loading, empty, error, offline, and conflict states.
7. Update the service-worker module list and version pair when the frontend graph changes.
8. Add focused regression tests for behavior that could materially hurt a household.
9. Update product, architecture, data, AI, deployment, or decision documentation when materially affected.

## Verify

Run `npm test` and `git diff --check`. Apply the risk-specific checks from `AGENTS.md`.

For visible behavior, exercise the real user flow in a browser, inspect narrow mobile layout and console errors, and verify relevant loading/error/empty states. For server or persistence work, verify household access, sanitization, old/new record compatibility, round-trip persistence, and version conflicts.

Never claim an unavailable build, lint, type-check, browser, or production check was performed.

## Report

Lead with the outcome, then report:

- what changed;
- why this implementation fits the existing architecture;
- checks actually run;
- risks, limitations, data implications, and useful follow-up.

Do not deploy unless the user explicitly asks.
