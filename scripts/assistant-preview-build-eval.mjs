// Deploy-preview-only synthetic model check. It never invokes app functions,
// household access, usage accounting, or Netlify Blobs.
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assistantProviderRequest, cleanAssistantRequest, cleanAssistantResponse } from "../netlify/functions/assistant.js";

const previewBranch = "codex/family-help-ai-eval";
const previewId = "23";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const maxCalls = 3;

function isActivePreview(environment) {
  // Netlify documents HEAD as the Git provider's source branch. Pin the one
  // approved evaluation to its source branch and its verified review ID.
  return environment.CONTEXT === "deploy-preview"
    && environment.HEAD === previewBranch
    && environment.PULL_REQUEST === "true"
    && environment.REVIEW_ID === previewId;
}

function inputFor(caseItem) {
  return cleanAssistantRequest({
    question: caseItem.question,
    language: "en",
    history: caseItem.history || [],
    context: caseItem.context,
  });
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function fail(write, caseId, attempted, message) {
  write(`${JSON.stringify({ familyHelpPreviewEval: "failed", case: caseId, callsAttempted: attempted, callsAllowed: maxCalls })}\n`);
  throw new Error(message);
}

function validate(caseItem, input, raw) {
  const sourceIds = new Set(input.context.sources.map((source) => source.id));
  const result = cleanAssistantResponse({
    ...raw,
    contextDates: input.context.scope.resolvedDateKeys.length ? input.context.scope.resolvedDateKeys : input.context.dates,
    sourceTypes: new Map(input.context.sources.map((source) => [source.id, source.type])),
  }, sourceIds);
  if (!result) throw new Error("unusable response");
  if (!(caseItem.expect.sources || []).every((id) => result.sources.includes(id))) throw new Error("missing required citation");
  if (caseItem.expect.action && (result.action.type !== caseItem.expect.action.type || !sameValue(result.action.args, caseItem.expect.action.args))) throw new Error("unexpected action");
  if (caseItem.expect.actions && !caseItem.expect.actions.includes(result.action.type)) throw new Error("unexpected action");
  if ((caseItem.expect.forbidden || []).some((phrase) => result.answer.toLowerCase().includes(phrase))) throw new Error("unsupported claim");
  return result;
}

async function loadCases() {
  const cases = JSON.parse(await readFile(join(root, "tests/fixtures/assistant-preview-build-eval.json"), "utf8"));
  if (!Array.isArray(cases) || cases.length !== maxCalls) throw new Error("Family Help preview evaluator requires exactly three synthetic cases.");
  return cases;
}

/** Runs the capped synthetic check; exported so its no-network controls are testable. */
export async function runPreviewBuildEvaluation({ environment = process.env, fetchImpl = fetch, write = (line) => process.stdout.write(line) } = {}) {
  if (!isActivePreview(environment)) {
    write("Family Help preview evaluator skipped outside its disposable deploy-preview branch.\n");
    return { status: "skipped", callsAttempted: 0 };
  }

  const dryRun = environment.FAMILY_ASSISTANT_PREVIEW_DRY_RUN === "1";
  if (!dryRun && !environment.OPENAI_API_KEY) fail(write, null, 0, "Family Help preview evaluator requires its deploy-preview API key.");
  const cases = await loadCases();

  if (dryRun) {
    for (const caseItem of cases) {
      const input = inputFor(caseItem);
      if (!input) fail(write, caseItem.id, 0, "Family Help preview fixture is invalid.");
      write(`${JSON.stringify({ case: caseItem.id, dryRun: true, callsAttempted: 0, callsAllowed: maxCalls, schema: assistantProviderRequest(input).tools[0].name })}\n`);
    }
    write(`${JSON.stringify({ familyHelpPreviewEval: "dry-run-passed", callsAttempted: 0, callsAllowed: maxCalls })}\n`);
    return { status: "dry-run-passed", callsAttempted: 0 };
  }

  let attempted = 0;
  for (const caseItem of cases) {
    const input = inputFor(caseItem);
    if (!input) fail(write, caseItem.id, attempted, "Family Help preview fixture is invalid.");
    attempted += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 14000);
    let payload;
    try {
      const response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${environment.OPENAI_API_KEY}`, "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(assistantProviderRequest(input)),
      });
      if (!response.ok) throw new Error("provider response was not successful");
      payload = await response.json();
    } catch {
      fail(write, caseItem.id, attempted, "Family Help preview case could not complete.");
    } finally {
      clearTimeout(timeout);
    }
    const call = payload?.output?.find((entry) => entry.type === "function_call" && entry.name === "respond_to_family");
    if (!call?.arguments) fail(write, caseItem.id, attempted, "Family Help preview case returned no structured response.");
    let raw;
    try {
      raw = JSON.parse(call.arguments);
    } catch {
      fail(write, caseItem.id, attempted, "Family Help preview case returned invalid structured response.");
    }
    let result;
    try {
      result = validate(caseItem, input, raw);
    } catch {
      fail(write, caseItem.id, attempted, "Family Help preview case did not satisfy its assertions.");
    }
    write(`${JSON.stringify({ case: caseItem.id, answer: result.answer, sources: result.sources, action: result.action, assertions: "passed", callsAttempted: attempted, callsAllowed: maxCalls })}\n`);
  }
  write(`${JSON.stringify({ familyHelpPreviewEval: "passed", callsAttempted: maxCalls, callsAllowed: maxCalls })}\n`);
  return { status: "passed", callsAttempted: maxCalls };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runPreviewBuildEvaluation();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
