import assert from "node:assert/strict";
import test from "node:test";

import { readJsonRequest } from "../netlify/functions/_http.js";

test("readJsonRequest parses valid JSON bodies", async () => {
  const { payload, error } = await readJsonRequest(new Request("https://example.com", {
    method: "POST",
    body: JSON.stringify({ ok: true }),
  }));

  assert.equal(error, undefined);
  assert.deepEqual(payload, { ok: true });
});

test("readJsonRequest rejects invalid JSON bodies", async () => {
  const { error } = await readJsonRequest(new Request("https://example.com", {
    method: "POST",
    body: "not-json",
  }));

  assert.equal(error.status, 400);
  assert.deepEqual(await error.json(), { error: "Invalid JSON" });
});

test("readJsonRequest rejects oversized bodies before parsing", async () => {
  const { error } = await readJsonRequest(new Request("https://example.com", {
    method: "POST",
    headers: { "content-length": "20" },
    body: JSON.stringify({ ok: true }),
  }), { maxBytes: 10 });

  assert.equal(error.status, 413);
  assert.deepEqual(await error.json(), { error: "Request body is too large." });
});

test("readJsonRequest rejects oversized bodies without a content-length header", async () => {
  const { error } = await readJsonRequest(new Request("https://example.com", {
    method: "POST",
    body: JSON.stringify({ value: "too long" }),
  }), { maxBytes: 10 });

  assert.equal(error.status, 413);
  assert.deepEqual(await error.json(), { error: "Request body is too large." });
});
