---
name: prototype-ui
description: Run a bounded, throwaway UI experiment inside an existing Ryan Family Menu screen to answer a specific visual or interaction question. Use for exploratory visual changes such as recipe-search layouts, interaction models, or navigation treatments. Do not treat prototype code as production-ready.
---

# UI Prototype

A prototype exists to answer one product question quickly. It is not a redesign mandate and it is not production code.

## 1. State the question

Before editing, write the question in one sentence. Example:

> Does a Turnstile-style spatial recipe browser make finding a dinner feel faster and more intuitive than the current one-dimensional result list on a phone?

Also state what evidence would answer it: visual clarity, discoverability, interaction feel, or another observable outcome.

## 2. Lock the scope

Prefer mounting the experiment inside the existing screen and keeping the existing data, search, auth, and navigation behavior authoritative.

For UI-only prototypes:

- do not change persisted household data or schemas;
- do not change backend/API behavior unless the prototype question requires it;
- do not introduce new dependencies or build tooling merely for the prototype;
- do not opportunistically clean up unrelated code;
- report adjacent problems separately instead of fixing them;
- keep production deployment out of scope unless the user explicitly requests it.

Mark experimental code clearly so future work can distinguish it from durable product architecture.

## 3. Inspect before changing

Read the relevant sections of `PRODUCT.md`, `DESIGN.md`, and `AGENTS.md`, then trace the existing rendered surface and the code that drives it.

Identify:

- the current user action and result;
- the smallest subtree or module that can host the experiment;
- behaviors that must stay authoritative;
- mobile, bilingual, accessibility, PWA, and reduced-motion constraints that apply.

Do not redesign an isolated mockup when the experiment can live against real application context.

## 4. Implement the smallest coherent experiment

Change only what is required to answer the stated question.

Keep the prototype easy to remove. Prefer a contained module, class, or clearly delimited experimental block over changes spread across unrelated files.

When the question truly requires comparing alternatives, make the variants structurally different and easy to switch between. Do not create variants merely to satisfy ceremony when the user has already chosen the direction being tested.

## 5. Verify rendered behavior, not implementation status

A successful commit, test run, or Netlify build is not proof that the prototype works.

Before handing the prototype back:

1. run the relevant automated tests;
2. inspect the actual deploy preview in a real browser;
3. inspect a narrow mobile viewport;
4. exercise the requested interaction end to end;
5. check keyboard/focus behavior and reduced motion when relevant;
6. confirm existing search/filter/selection behavior still works;
7. confirm no unrelated persisted data, auth, backend, or production behavior changed.

If rendered verification cannot be performed, say that explicitly and do not mark the experiment ready for review.

## 6. Capture the decision

When the product owner reviews the prototype, record:

- the question the prototype answered;
- what worked and what did not;
- the selected interaction or visual decision;
- what should be rewritten or hardened before production.

Do not promote prototype code to production merely because the idea was validated. The validated behavior may be kept, but production hardening, tests, accessibility, and maintainability still require review.

## Stop rule

Once the prototype can answer the stated question, stop. Do not expand into adjacent improvements unless the user explicitly changes the scope.
