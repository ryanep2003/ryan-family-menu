# Durable Decisions

This is a lightweight record of architectural and product decisions that future contributors should not reverse accidentally. Add an entry only when a decision changes enduring structure, data meaning, access, deployment, or a significant product constraint.

## 2026-08-15 — Keep the current lightweight stack

**Decision:** Continue using framework-free HTML/CSS/JavaScript, Netlify Functions, and Netlify Blobs rather than introducing a frontend framework, traditional server, or relational database preemptively.

**Reason:** The product is functioning, inexpensive, understandable, and deploys without a build pipeline. Current risks come from coordination and documentation, not from an inability of the stack to support present usage.

**Alternatives considered:** React/Vite, Vercel, Cloudflare Workers, and a SQL-backed application.

**Consequences:** Preserve the simple deployment model. Improve modules and contracts incrementally. Reconsider infrastructure only for a demonstrated need such as stronger account security, querying, scale, or observability.

## 2026-08-15 — Household capability keys provide access

**Decision:** A high-entropy household key grants shared read/write access to one household. The server stores only its digest, and every shared record is namespaced by household ID.

**Reason:** This gives invited families a simple shared experience without requiring a full account system.

**Alternatives considered:** Individual email/password accounts, OAuth, and administrator/member roles.

**Consequences:** Treat the key like a password. Attribution is not verified identity. Key rotation, recovery, revocation, and roles remain future security work before broad public adoption.

## 2026-08-15 — Preserve household data through tolerant readers

**Decision:** Persisted JSON changes should be additive, normalized on both client and server, and compatible with older unwrapped or legacy records.

**Reason:** There is no formal migration runner, households may use cached older clients, and code rollback must not make current data unreadable.

**Alternatives considered:** Destructive in-place migrations and strict schema rejection.

**Consequences:** Legacy meal fields and version-envelope compatibility remain until an explicit, verified migration removes them. Data changes require focused regression tests and documentation.

## 2026-08-15 — Keep shared browser fallbacks household-scoped

**Decision:** Continue storing local fallback state under `family-menu:<household-id>:` and exclude function requests from the service-worker cache.

**Reason:** Families need graceful recovery from network failures without leaking cached data between households or mistaking stale API responses for live shared state.

**Alternatives considered:** Network-only behavior and globally shared browser keys.

**Consequences:** Local and remote state must remain coordinated. New persistent browser keys must use `createHouseholdStorage()`.

## 2026-08-15 — Use deterministic extraction before AI

**Decision:** Prefer structured webpage recipe data and normal business rules before making an AI call; use AI for image interpretation, unstructured fallback extraction, and translation.

**Reason:** Deterministic paths are faster, cheaper, and easier to test. AI adds value when input is visual or unstructured.

**Alternatives considered:** Sending every import and planning action to a model.

**Consequences:** Keep AI calls explicit, bounded, sanitized, and reviewable. Manual entry remains a supported fallback.

## 2026-08-15 — Protect Netlify usage from runaway traffic

**Decision:** Keep finite retries, avoid polling, avoid broad media pre-caching, and apply a generous site-level rate limit only to clearly abnormal traffic.

**Reason:** A prior rapid shared-state request loop consumed substantial bandwidth and Netlify credits. Normal family use requires only a small request volume.

**Alternatives considered:** No cap, very strict per-function limits, and additional infrastructure.

**Consequences:** Any timer, retry, refresh, caching, or auto-save change must consider request multiplication and production cost. Normal household use must not be impeded.

## 2026-08-15 — Start household learning with structured memory

**Decision:** Store family members, explicit preferences, household rules, dinner feedback/history, and deterministic recommendation ranking without introducing embeddings or a vector database.

**Reason:** The smallest valuable learning loop is plan dinner, record quick feedback, and improve later suggestions. Structured facts are sufficient for this stage and are easier to inspect and correct.

**Alternatives considered:** A large AI memory backend or vector search from the start.

**Consequences:** Learning must stay transparent, optional, and low-friction. Add more sophisticated memory only after real household usage demonstrates the need.

## 2026-08-15 — Translate recipes only on explicit request
## 2026-08-16 — Keep Cook Along browser-first

**Decision:** Make live cooking guidance deterministic and browser-first, with an optional device speech command and no AI request in the cooking loop. Save actual servings, leftovers, notes, and a quick outcome into existing dinner memory.

**Reason:** Families need a reliable, low-cost kitchen flow that works even with weak connectivity and does not add a provider call for every step.

**Consequences:** Recipe steps remain the source of truth; future recommendations can use the saved structured feedback. AI can be considered later for optional enhancements, but it is not required for cooking mode.

**Decision:** Changing the app language never starts recipe AI calls. A family member may explicitly translate the one selected recipe when its current-language content is missing.

**Reason:** The former render-time queue could fan one language switch out into many OpenAI calls and shared-state writes, creating avoidable cost and version conflicts.

**Alternatives considered:** Automatically translating the full library, translating a fixed background batch, and removing AI translation entirely.

**Consequences:** One translation action produces at most one provider call and one shared-state save. Original recipe content remains readable as a fallback, existing translations are preserved, and safety actions remain locked when a required warning is untranslated.

## 2026-08-16 — The shopping list is authoritative at the store

**Decision:** Treat home inventory as advice, not as permission to silently reduce or hide planned groceries. A possible match stays active until a shopper explicitly chooses **Keep on list** or **Have enough**.

**Reason:** Inventory can become stale between household updates. Automatically checking off a partial or old match can make a family underbuy while they are already at the store.

**Alternatives considered:** Automatically subtracting structured inventory quantities, continuing to hide all name matches, and requiring inventory cleanup before shopping.

**Consequences:** New grocery rows store additive suggestion and decision fields. Legacy auto-hidden matches safely return for review. The full recipe quantity remains visible until a person confirms coverage, and no production-data rewrite is required.

## 2026-08-16 — Shopping trips end with one explicit finish step

**Decision:** Organize grocery use as prepare the list, check purchases at the store, then finish the trip. Receipt photo capture and manual receipt totals live in that final step; a receipt is helpful but optional.

**Reason:** Receipt capture was buried in list utilities and purchased items could move home without a clear end-of-trip moment. Families need one understandable bridge between the shopping list, home inventory, and grocery budget.

**Alternatives considered:** Keeping receipt upload in a tools menu, requiring a receipt for every trip, and automatically moving every unchecked list item into inventory.

**Consequences:** Receipt upload remains directly available from the Shopping header even when nothing has been checked. Checked rows are the authoritative purchased set when no detailed receipt is available. Receipt recognition may match additional items. Finishing removes purchased rows, updates home inventory, and records a receipt total when supplied without introducing a new persisted schema.

## 2026-08-17 — Keep a bounded recovery trail for shared menus

**Decision:** Write a separate, household-scoped audit record for successful shared-state saves. Retain recent change events and prior menu snapshots, block an accidental empty overwrite, and require an explicit Clear week or restore action when removing a plan is intentional.

**Reason:** A stale browser or competing phone could replace a populated plan with an empty copy, while the existing activity feed only described recent actions and could be overwritten with the rest of state. Families need a simple way to understand what changed and recover a prior menu without exposing raw storage or adding a large history system.

**Alternatives considered:** Relying on the in-state activity feed, storing every full state forever, or silently accepting all last-writer-wins saves.

**Consequences:** Audit history is bounded and best-effort; it is not a legal-grade event log. Restore is explicit and creates a new version. The separate record adds one small Blob write per shared-state save, so it must remain bounded and must not be polled.
