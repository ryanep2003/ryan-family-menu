---
name: ui-review
description: Review an existing Ryan Family Menu screen or workflow for usability, visual hierarchy, responsive behavior, accessibility, and state clarity. Use when asked to critique, audit, evaluate, or prioritize UI/UX improvements from source, screenshots, or a rendered app. Do not implement recommendations unless the user separately asks for changes.
---

# UI Review

Evaluate the actual household workflow, not an isolated visual composition.

## Gather Evidence

1. Read `PRODUCT.md`, `DESIGN.md`, and relevant sections of `AGENTS.md`.
2. Identify the user's goal, device context, frequency, and likely time pressure.
3. Inspect the rendered application with browser tools when available. Use screenshots as evidence, but trace the corresponding controls and states in source.
4. Review both English and Spanish fit when labels or content are affected.

Do not judge only from source code when the screen can be rendered safely.

## Evaluate

Check:

- information hierarchy and the next obvious action;
- plain-language clarity and cognitive load;
- mobile width, safe areas, fixed navigation, scrolling, and one-handed use;
- spacing, typography, alignment, touch targets, and consistency with `DESIGN.md`;
- search, selection, editing, confirmation, and undo interactions;
- empty, loading, success, conflict, offline, and error states;
- keyboard focus, labels, semantic structure, contrast, reduced motion, and screen-reader status messaging;
- accidental duplicate entry or repeated work across meal, grocery, inventory, and feedback flows;
- privacy and trust when household data, AI, or attribution is visible.

Consider new users and frequent users separately. Avoid turning a daily household task into an administrative dashboard.

## Prioritize

Separate the output into:

### Problems

Describe evidence-backed usability problems, their affected users, and their consequence.

### Recommended improvements

Prioritize each recommendation:

- **P1:** blocks, misleads, loses data, or makes a core mobile task materially difficult;
- **P2:** recurring friction or accessibility inconsistency;
- **P3:** useful polish with limited functional impact.

Recommend the smallest coherent improvement first. Distinguish necessary fixes from optional enhancements and avoid redesigning unrelated views.

## Conclude

Call out missing states, unanswered product decisions, and what should be tested after implementation. Do not edit files unless the user explicitly changes the task from review to implementation.
