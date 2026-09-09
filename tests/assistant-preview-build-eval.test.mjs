import assert from "node:assert/strict";
import test from "node:test";

import { runPreviewBuildEvaluation } from "../scripts/assistant-preview-build-eval.mjs";

// Netlify Deploy Preview metadata: HEAD is the source branch supplied by the
// Git provider, and REVIEW_ID is the deploy preview / PR number.
const activeEnvironment = { CONTEXT: "deploy-preview", BRANCH: "main", HEAD: "codex/family-help-ai-eval", PULL_REQUEST: "true", REVIEW_ID: "23", OPENAI_API_KEY: "test-only" };
const nullArgs = { dateKeys: null, dateKey: null, fromDateKey: null, recipeSourceId: null, period: null, mode: null, servings: null, text: null, store: null, checked: null, location: null, stockState: null, amount: null, unit: null };
const responses = [
  { answer: "The recipe lists basil, while the grocery row is still unchecked.", sources: ["recipe:pesto", "grocery:basil"], action: { type: "none", sourceId: "", args: nullArgs } },
  { answer: "The grocery row says basil is planned and remains unchecked.", sources: ["grocery:basil"], action: { type: "none", sourceId: "", args: nullArgs } },
  { answer: "I can prepare basil for your review.", sources: [], action: { type: "add_grocery", sourceId: "", args: { ...nullArgs, text: "basil", store: "" } } },
];

function modelResponse(body) {
  return new Response(JSON.stringify({ output: [{ type: "function_call", name: "respond_to_family", arguments: JSON.stringify(body) }] }), { status: 200 });
}

test("preview evaluator makes exactly three synthetic calls and verifies the exact grocery proposal", async () => {
  const logs = [];
  let calls = 0;
  const result = await runPreviewBuildEvaluation({
    environment: activeEnvironment,
    fetchImpl: async () => modelResponse(responses[calls++]),
    write: (line) => logs.push(line),
  });
  assert.deepEqual(result, { status: "passed", callsAttempted: 3 });
  assert.equal(calls, 3);
  assert.match(logs.at(-1), /"callsAttempted":3/);
  assert.match(logs[2], /"text":"basil","store":""/);
});

test("preview evaluator skips a different pull-request source branch and does not make a call", async () => {
  let calls = 0;
  const result = await runPreviewBuildEvaluation({
    environment: { ...activeEnvironment, HEAD: "other-branch" },
    fetchImpl: async () => { calls += 1; throw new Error("must not run"); },
    write: () => {},
  });
  assert.deepEqual(result, { status: "skipped", callsAttempted: 0 });
  assert.equal(calls, 0);
});

test("preview evaluator fails closed for a wrong context, review, or missing source head", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("must not run"); };
  assert.deepEqual(await runPreviewBuildEvaluation({ environment: { ...activeEnvironment, CONTEXT: "branch-deploy" }, fetchImpl, write: () => {} }), { status: "skipped", callsAttempted: 0 });
  const { HEAD: _unused, ...missingHead } = activeEnvironment;
  assert.deepEqual(await runPreviewBuildEvaluation({ environment: missingHead, fetchImpl, write: () => {} }), { status: "skipped", callsAttempted: 0 });
  assert.deepEqual(await runPreviewBuildEvaluation({ environment: { ...activeEnvironment, REVIEW_ID: "24" }, fetchImpl, write: () => {} }), { status: "skipped", callsAttempted: 0 });
  assert.equal(calls, 0);
});

test("preview evaluator reports zero calls when its preview key is absent", async () => {
  const logs = [];
  const { OPENAI_API_KEY: _unused, ...missingKey } = activeEnvironment;
  await assert.rejects(() => runPreviewBuildEvaluation({ environment: missingKey, write: (line) => logs.push(line) }), /requires its deploy-preview API key/);
  assert.match(logs[0], /"callsAttempted":0/);
});

test("preview evaluator stops after the first failed call and reports the attempt count", async () => {
  const logs = [];
  let calls = 0;
  await assert.rejects(() => runPreviewBuildEvaluation({
    environment: activeEnvironment,
    fetchImpl: async () => { calls += 1; return new Response("synthetic failure", { status: 500 }); },
    write: (line) => logs.push(line),
  }), /case could not complete/);
  assert.equal(calls, 1);
  assert.match(logs[0], /"callsAttempted":1/);
});
