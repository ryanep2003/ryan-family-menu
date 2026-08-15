---
name: test-mobile-pwa
description: Test Ryan Family Menu on narrow mobile layouts and applicable Progressive Web App states using the rendered application. Use after UI, navigation, service-worker, manifest, module-graph, install, update, offline, caching, or sync changes, and before deploying meaningful mobile-facing work. Report evidence and gaps; do not implement fixes unless separately requested.
---

# Test Mobile PWA

Verify the experience families actually use on phones. Prefer the rendered app over source-only assertions.

## Prepare Safely

1. Read `AGENTS.md`, `DESIGN.md`, and the PWA sections of `docs/ARCHITECTURE.md` and `docs/DEPLOYMENT.md`.
2. Identify the changed user flow and which mobile/PWA states could regress.
3. Prefer a local HTTP server with controlled household/API mocks for actions that write data.
4. Use production only for read-only verification or an explicitly authorized, reversible smoke action.
5. Never expose household keys, private household content, or environment secrets in screenshots, console output, or reports.

Do not use `file://`; JavaScript modules and service workers require an HTTP context.

## Test the Mobile Workflow

Use an actual browser tool when available. Start with a representative phone viewport around 390 CSS pixels wide, then check 360 pixels for narrow-device pressure. Preserve the device pixel ratio and safe-area behavior when the tool supports them.

Exercise the complete affected workflow rather than only loading the view. Check:

- no accidental horizontal page overflow;
- readable hierarchy without clipped English or Spanish text;
- minimum practical touch targets and sufficient spacing;
- fixed bottom navigation that does not cover content or actions;
- header controls, segmented controls, forms, disclosures, lists, and dialogs at narrow widths;
- keyboard focus, focus return, input zoom risk, and visible focus treatment;
- scroll position after changing views or closing details;
- loading, empty, success, validation, conflict, offline, and retry states that apply;
- reduced-motion behavior when animations changed;
- console errors, failed module requests, repeated network calls, and layout warnings.

Switch between English and Spanish for any changed labels, forms, or responsive layouts.

## Check PWA Integrity

When static modules, the manifest, icons, install behavior, or caching changed:

1. Run the service-worker and PWA tests through `npm test`.
2. Confirm `service-worker.js` pre-caches every first-party module imported by the app shell.
3. Confirm `CACHE_NAME` matches the `app.js?v=...` version in `index.html`.
4. Confirm the manifest loads, icon paths resolve, and installed display/theme metadata remains coherent.
5. Confirm function requests are not served from the service-worker cache.
6. Test one update cycle: old controlled page, new worker available, user reload/update, and new asset active.
7. Test an offline reopen when the release affects the static shell or module graph.
8. Confirm large recipe photos are not broadly pre-cached.

Installation prompts differ across iOS, Android, and desktop browsers. If the available environment cannot reproduce a native prompt, verify the supporting metadata and instruction-selection logic and clearly report the device gap.

## Check Sync and Request Behavior

For startup, offline, or reconnect changes:

- confirm a cached static shell can open without a function response;
- confirm household-scoped local fallback does not cross households;
- reconnect and confirm pending changes settle or present a finite retry action;
- confirm no polling or rapid retry loop appears in the network timeline;
- confirm one in-flight shared-state request is reused when applicable.

## Report

Report:

- viewports and language modes tested;
- user flows and PWA states exercised;
- console/network findings;
- screenshots or measurements when useful;
- defects prioritized by user impact;
- device-specific or offline/install states that could not be verified.

Do not implement discovered fixes unless the user separately requests implementation. Use `$debug-bug` for root-cause work or `$build-feature` for approved UI changes.
