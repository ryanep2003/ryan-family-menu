import assert from "node:assert/strict";
import test from "node:test";

import { classifyRequestFailure, getJson, postJson, putJson } from "../api.js";

function stalledResponse(options) {
  return {
    ok: true,
    status: 200,
    json: () => new Promise((resolve, reject) => {
      const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      if (options.signal?.aborted) abort();
      else options.signal?.addEventListener("abort", abort, { once: true });
    }),
  };
}

test("grocery PUT requests can opt into a bounded timeout", async () => {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => "" };
  globalThis.fetch = async (_url, options) => stalledResponse(options);
  try {
    await assert.rejects(
      putJson("/groceries", { items: [], version: 1 }, "Could not save groceries.", { timeoutMs: 10 }),
      (error) => error.code === "request-timeout" && error.message === "Could not save groceries.",
    );
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousStorage;
  }
});

test("external cancellation is not mislabeled as a timeout", async () => {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => "" };
  globalThis.fetch = async () => { throw Object.assign(new Error("cancelled"), { name: "AbortError" }); };
  const controller = new AbortController();
  controller.abort();
  try {
    await assert.rejects(
      getJson("/groceries", "Could not load groceries.", { signal: controller.signal }),
      (error) => error.name === "AbortError" && !error.code,
    );
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousStorage;
  }
});

test("unrelated POST requests keep their existing unbounded behavior by default", async () => {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.localStorage;
  let requestOptions;
  globalThis.localStorage = { getItem: () => "" };
  globalThis.fetch = async (_url, options) => {
    requestOptions = options;
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  try {
    assert.deepEqual(await postJson("/recognize", {}, "Recognition failed."), { ok: true });
    assert.equal("signal" in requestOptions, false);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousStorage;
  }
});

test("request failures map to safe grocery recovery reasons", () => {
  assert.equal(classifyRequestFailure({ name: "QuotaExceededError" }, { online: false }), "storage");
  assert.equal(classifyRequestFailure({ name: "SecurityError" }, { online: true }), "storage");
  assert.equal(classifyRequestFailure({}, { online: false }), "offline");
  assert.equal(classifyRequestFailure({ code: "request-timeout" }, { online: true }), "timeout");
  assert.equal(classifyRequestFailure({ code: "malformed-response" }, { online: true }), "malformed");
  assert.equal(classifyRequestFailure({ status: 401 }, { online: true }), "access");
  assert.equal(classifyRequestFailure({ status: 403 }, { online: true }), "access");
  assert.equal(classifyRequestFailure({ status: 429 }, { online: true }), "rate-limit");
  assert.equal(classifyRequestFailure({ status: 503 }, { online: true }), "service");
  assert.equal(classifyRequestFailure(new Error("private provider text"), { online: true }), "unknown");
});
