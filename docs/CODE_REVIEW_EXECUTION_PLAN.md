# Code Review Execution Plan

**Prepared:** 2026-08-17
**Source review:** `docs/CODE_REVIEW_2026-08-17.md`
**Verified baseline:** production release `1aed47c`; `npm test` passes 257/257.

## Objective

Resolve the review findings in small, independently testable releases. Protect household data first, preserve the existing architecture where practical, and do not turn the thirty findings into one broad rewrite.

## Operating Rules

- Read `AGENTS.md`, the source review, and the relevant repository skill before each phase.
- Work on one phase at a time and stop at its release gate.
- Do not deploy until Eric explicitly approves that phase for deployment.
- Preserve household namespaces, record keys, version envelopes, legacy meal fields, and local-storage compatibility.
- Add regression tests for the actual failure mode, not only structural source assertions.
- Run `npm test` and `git diff --check` after every phase.
- Use controlled local fixtures for conflicts and offline behavior; do not experiment with production household data.
- Do not introduce polling, rapid retries, a new framework, or a broad database migration as part of these fixes.

## Phase 1 — Prevent Concurrent-Edit Data Loss

**Findings:** H2, H3, M4.

1. Give groceries and inventory independent, deep-cloned base snapshots.
2. Replace in-place grocery and inventory mutations with immutable item replacement where the affected controls write state.
3. Add an inventory three-way merge and one bounded retry, matching the corrected grocery flow.
4. Make missing or invalid incoming versions fail closed with `409` for current versioned endpoints.
5. Review the shared-state base snapshot for the same aliasing problem and correct it without changing record semantics.

**Acceptance checks:**

- Two simulated clients can change different grocery items and both changes survive a forced conflict.
- A local checked state survives an unrelated remote grocery save.
- A local inventory addition survives an unrelated remote inventory save.
- Conflicting deletion and edit behavior is explicitly tested.
- Missing or invalid versions cannot overwrite an existing record.
- Retries remain finite and request counts do not loop.

## Phase 2 — Open Cached Households Offline

**Finding:** H1.

Cache only the validated household profile needed to identify the active household. A network failure with a saved key and cached validated profile should open household-scoped cached data with an honest offline state. Only an authoritative `401` should clear access and return to the household gate.

**Acceptance checks:**

- After one validated online session, a cold offline start opens the cached household.
- An invalid key receiving `401` still opens the gate and cannot access another household's cache.
- Reconnection revalidates and settles without polling or a retry loop.

## Phase 3 — Protect In-Progress Forms

**Findings:** M1, M2.

Preserve focused or dirty field values during background renders. Fix receipt removal with event delegation from a stable container. Keep Cook Along timer updates isolated from the finish form.

**Acceptance checks:**

- Focus or foreground refresh does not erase an unsaved handoff note, budget value, inventory edit, expiration date, or Cook Along finish entry.
- Receipt removal works after any number of unrelated renders.
- English and Spanish controls behave the same way.

## Phase 4 — Make Yield and Grocery Math Dependable

**Findings:** H4, M8, M13, M14.

Require or explicitly resolve recipe yield before scaled planning. Preserve shopper decisions when rebuilding a list. Support common Unicode fractions and ranges. Round countable/package groceries sensibly without globally eliminating valid fractional recipe batches.

Do not silently assume a yield without labeling it. Prefer asking once and saving the answer; any temporary default must be visible and correctable.

**Acceptance checks:**

- A four-serving recipe planned for six scales groceries and displays its batch/leftover calculation.
- Existing recipes missing yield are discoverable and repairable without hunting through the library.
- Rebuilding preserves checked state and inventory decisions for matching ingredients.
- Unicode fractions and common ranges scale or are visibly marked as unscaled.

## Phase 5 — Make Bilingual Entry and Fallback Readable

**Findings:** H5, M11.

Fall back to available source-language content with a small language marker instead of replacing useful names with `Translation pending`. Localize the household gate and make its language control available before authentication.

Do not automatically send every recipe to AI. Preserve the explicit, bounded translation action unless a separately approved cost policy replaces it.

## Phase 6 — Reduce Broad State Traffic and Growth

**Findings:** H6, M3, M9.

Stop remote writes caused only by week navigation. Lazy-load household history. Bound or reduce recovery snapshots while preserving useful restoration. Add an honest `413` state-too-large path. Normalize recommendation context once per ranking pass and prevent unlimited historical score accumulation.

Treat splitting receipts/activity out of shared state as a separate safe persisted-data change if still required after measuring record size.

## Phase 7 — Sharing and Security Hardening

**Findings:** M5, M6, M15, M16, L2, L8.

Before wider sharing, add bounded household AI usage, design key rotation/recovery with a safe migration, harden recipe URL resolution against private networks, make sanitizers tolerant of malformed entries, stop silent recipe eviction at the cap, and clear household-scoped local residue when leaving.

Key rotation and record decomposition require `$safe-database-change`; do not combine them casually with UI work.

## Product/UX Backlog

**Findings:** M7, M10, M12, L1, L5, L6.

- Keep pantry matches advisory; improve matching and add bulk confirmation instead of automatically hiding groceries.
- Reduce disclosure depth for everyday inventory and checklist actions.
- Give new households an empty plan while retaining seed recipes in the library.
- Remove or repair the CSP-blocked card stagger without weakening CSP.
- Use boundary-aware preference matching with an explanation.
- Preserve commas inside normal grocery item names.

## Findings Requiring No Immediate Change

- **L3:** Do not add a build system solely for version stamping. The app/service-worker parity test already protects the primary release version; simplify only if it remains error-prone.
- **L7:** Netlify currently serves HSTS (`max-age=31536000; includeSubDomains; preload`) even though it is not declared in `netlify.toml`.

## First Instruction for the Implementing Agent

Begin only with **Phase 1**. Inspect the current flows, write failing conflict tests, implement the smallest compatible correction, run the full suite, and report the result. Do not begin Phase 2 and do not deploy until Eric reviews Phase 1.
