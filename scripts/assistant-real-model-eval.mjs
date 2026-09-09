// Opt-in, synthetic-data evaluation for the Family Help response contract.
// It is intentionally capped and never reads a household or browser storage.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assistantProviderRequest, cleanAssistantRequest, cleanAssistantResponse } from "../netlify/functions/assistant.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(await readFile(join(root, "tests/fixtures/assistant-real-model-eval.json"), "utf8"));
const requested = Number(process.env.FAMILY_ASSISTANT_EVAL_MAX_CALLS || 2);
const maxCalls = Number.isInteger(requested) && requested > 0 && requested <= 3 ? requested : 0;
if (!maxCalls) throw new Error("FAMILY_ASSISTANT_EVAL_MAX_CALLS must be an integer from 1 through 3.");
if (!process.env.OPENAI_API_KEY) {
  process.stdout.write("OPENAI_API_KEY is unavailable; synthetic Family Help model evaluation was not run.\n");
  process.exit(0);
}

for (const item of cases.slice(0, maxCalls)) {
  const input = cleanAssistantRequest({ question: item.question, language: "en", history: item.history || [], context: item.context });
  if (!input) throw new Error(`Invalid synthetic evaluation fixture: ${item.name}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14000);
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(assistantProviderRequest(input)),
    });
  } finally { clearTimeout(timeout); }
  if (!response.ok) throw new Error(`Model evaluation failed for ${item.name}: ${response.status}`);
  const payload = await response.json();
  const call = payload.output?.find((entry) => entry.type === "function_call" && entry.name === "respond_to_family");
  if (!call) throw new Error(`Model evaluation did not produce the response function for ${item.name}.`);
  const raw = JSON.parse(call.arguments);
  const sourceIds = new Set(input.context.sources.map((source) => source.id));
  const result = cleanAssistantResponse({ ...raw, contextDates: input.context.scope.resolvedDateKeys.length ? input.context.scope.resolvedDateKeys : input.context.dates, sourceTypes: new Map(input.context.sources.map((source) => [source.id, source.type])) }, sourceIds);
  if (!result) throw new Error(`Model evaluation returned an unusable response for ${item.name}.`);
  if (!(item.expect?.sources || []).every((id) => result.sources.includes(id))) throw new Error(`Model evaluation omitted expected source for ${item.name}.`);
  if (result.action.type !== item.expect?.action) throw new Error(`Model evaluation returned unexpected action for ${item.name}: ${result.action.type}`);
  if ((item.expect?.forbidden || []).some((phrase) => result.answer.toLowerCase().includes(phrase))) throw new Error(`Model evaluation made a forbidden claim for ${item.name}.`);
  process.stdout.write(`${item.name}: sanitized response passed fixture expectations\n`);
}
