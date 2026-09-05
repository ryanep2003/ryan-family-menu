# AI Integrations

## Overview

Ryan Family Menu uses the OpenAI Responses API for extraction and translation. AI runs only in Netlify Functions so `OPENAI_API_KEY` is never sent to the browser. Every AI endpoint validates household access before checking model configuration or making a provider call.

The default model is `gpt-5.4-mini`. `OPENAI_MODEL` can override it without a code change. Model changes should be tested against representative recipes, receipts, inventory photos, English/Spanish content, and malformed output before deployment.

## AI-Powered Flows

| Function | Input | Output | Cost-sensitive behavior |
|---|---|---|---|
| `recognize-recipe.js` | Up to 3 images | Recipe name, category, servings, ingredients, steps, warning, notes | High-detail image inputs |
| `recognize-receipt.js` | Up to 4 images plus language | Receipt metadata and purchased items | High-detail image inputs |
| `recognize-inventory.js` | Up to 6 images plus location/language | Inventory candidates with confidence | Largest image batch |
| `import-recipe-url.js` | Public URL | Recipe fields and optional image | Uses page JSON-LD first; AI only when structured recipe data is absent |
| `translate-recipe.js` | One selected recipe plus source/target languages | Translated localized fields | Runs only after the user requests translation for that recipe |

Manual recipe, grocery, and inventory entry remains available without OpenAI. URL import can work without OpenAI when the page exposes readable Recipe JSON-LD.

## School Lunch Generation

The School Lunches “Make me a lunch” and “Fill My Week” actions do not call OpenAI. They use deterministic browser logic over a bounded food catalog, child ratings and never-pack choices, family restrictions, recent approved lunches, preparation/storage constraints, current meal-plan and grocery ingredients, inventory, and realistically available leftovers. Hard restrictions and `never` ratings are excluded; recent mains are penalized; useful ingredient overlap and repeatedly approved foods are preferred.

This intentionally keeps the interaction immediate, offline-capable, explainable, and cost-free. The UI is a lunch builder, not a chatbot, and every generated component remains swappable. A future model-assisted ranking layer must remain optional, preserve deterministic fallback behavior, pass through the same restriction checks, and receive separate privacy and cost review.

## Action Assistant

Phase A of the Family Menu Action Assistant is also deterministic and browser-first. Filling empty dinners and refreshing the shopping list reuse existing ranking and grocery helpers; they do not call OpenAI. Typed requests currently map onto those same chips with keyword matching in the browser (Phase B lite); they do not call a model. A later typed-request phase may use the model only after household validation and the existing AI usage caps, and only to rank or interpret a request. The assistant must still preview and require Apply; it must never silent-write a plan.

See `docs/ACTION_ASSISTANT.md`.

## Prompt and Output Pattern

Each function builds a task-specific prompt that requests JSON only. The server extracts `output_text` or text content from the response, parses direct JSON when possible, and otherwise attempts to parse the first object-shaped substring.

This is tolerant but not a formal structured-output schema. Every parsed result is therefore cleaned before returning it to the browser:

- text and line counts are bounded;
- categories, locations, and language values are allow-listed;
- money, confidence, quantities, and servings are clamped;
- images are checked as data URLs and size-limited;
- required fields are validated;
- unsupported values fall back to safe defaults.

Do not trust model output directly, interpolate it into HTML without escaping, or store it without sanitization.

## Recipe Recognition

The prompt asks the model to transcribe one recipe from images without inventing missing information. It preserves long cooking instructions, requests an explicit category and servings estimate when visible, and returns concise notes and safety text.

Failure behavior:

- missing API configuration returns a clear server error;
- missing/invalid images return a client error before the provider call;
- provider errors are normalized, especially invalid-key errors;
- unparseable output produces an empty/invalid result that the form flow must handle;
- selected photos and manual fields remain available so the user can continue or save a local draft.

## Receipt Recognition

The receipt prompt extracts purchased item names and quantities separately from receipt-level store, date, subtotal, tax, and total. It explicitly ignores payment details and store messages.

The browser uses candidates for grocery/inventory workflows and stores only a compact receipt summary for budget calculations. The model is not the financial source of truth; users can review or correct results.

## Inventory Recognition

The inventory prompt identifies visible food or household items and assigns an allow-listed location, quantity text, and confidence. It is a suggestion flow: results are not automatically committed as authoritative inventory without user action.

## URL Import

URL import follows a deterministic-first sequence:

1. Validate a public HTTP/HTTPS URL and block obvious local/private hosts.
2. Fetch HTML with a timeout, manual redirect handling, content-type check, and byte limit.
3. Parse Recipe JSON-LD when present.
4. If no structured recipe exists and OpenAI is configured, send bounded page text to the model.
5. Fetch a bounded lead image when safe.
6. Return sanitized recipe fields for user review.

Do not weaken host checks, timeouts, redirect restrictions, content limits, or image limits without a security review.

## Translation

Translation preserves quantities, temperatures, timing, ordered steps, and safety warnings. When a selected recipe is missing the current language, the app shows its original content and offers an explicit action to translate that recipe. One action creates at most one provider call and one shared-state save. The app does not scan or translate the library in the background. It avoids copying untranslated safety content into a translated field and can disable cooking actions when required safety text is unavailable. Punctuation-only strings, leftover numbered chrome such as `.`, `·`, or `01 .`, and stock English review placeholders such as “Add cooking steps after review.” are not recipe or safety content; they must not render as empty cards or numbered blank steps. Add-to-meal and grocery actions stay hidden while that translation gate is showing.

Changing translation behavior must preserve:

- explicit English/Spanish field ownership;
- translation-key parity in the interface;
- safety-warning meaning;
- quantities and units;
- failure states that do not overwrite source content.

## Logging and Privacy

Current logging is limited mainly to function/browser console errors. There is no durable prompt log, AI usage ledger, token dashboard, or model-quality evaluation suite in the repository.

Do not add raw household recipes, photos, receipts, preferences, household keys, or API credentials to logs. If usage monitoring is added, record safe operational metadata such as function name, model, success/failure, latency, input count, and provider usage totals—not private content.

## Cost Controls

Daily usage reservations are serialized per household and route within each running function instance before the Blob read/write. This narrows concurrent races without changing the existing household scope or limit. It is not a distributed compare-and-set guarantee across multiple serverless instances; a future storage primitive would be needed for that stronger guarantee.

Existing controls include household access, request/image limits, deterministic URL parsing, finite retries, no background polling, and a site-level Netlify traffic cap.

Before increasing image counts, image detail, translation breadth, automatic triggers, or retry behavior, estimate the multiplication effect across households. A single user action should create a predictable, bounded number of provider calls.

Recipe translation is deliberately user-triggered and limited to the selected recipe. Do not restore library-wide translation queues or start translation from general rendering or language-switch events.

## Testing AI Changes

At minimum:

1. Test household access before provider configuration.
2. Test request and image limits.
3. Test valid, partial, malformed, and prose-wrapped JSON.
4. Test sanitizer boundaries and unsupported enum values.
5. Test provider authentication and generic failure messages.
6. Test the manual/deterministic fallback path.
7. Test both languages when localized output changes.
8. Never use or print a real production API key in tests.

Real-model testing should use a small, representative fixture set and a controlled API budget. Record durable prompt/model decisions in `DECISIONS.md`.
