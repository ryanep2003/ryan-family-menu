import test from "node:test";
import assert from "node:assert/strict";
import { requireWriteAuth } from "../netlify/functions/_auth.js";

test("write auth is disabled unless FAMILY_WRITE_TOKEN is configured", () => {
  const original = process.env.FAMILY_WRITE_TOKEN;
  delete process.env.FAMILY_WRITE_TOKEN;

  assert.equal(requireWriteAuth(new Request("https://example.com")), null);

  if (original === undefined) {
    delete process.env.FAMILY_WRITE_TOKEN;
  } else {
    process.env.FAMILY_WRITE_TOKEN = original;
  }
});

test("write auth rejects requests with the wrong configured token", async () => {
  const original = process.env.FAMILY_WRITE_TOKEN;
  process.env.FAMILY_WRITE_TOKEN = "family-secret";

  const response = requireWriteAuth(new Request("https://example.com", {
    headers: { "x-family-write-token": "wrong" },
  }));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Family write access is required." });

  if (original === undefined) {
    delete process.env.FAMILY_WRITE_TOKEN;
  } else {
    process.env.FAMILY_WRITE_TOKEN = original;
  }
});

test("write auth accepts requests with the configured token", () => {
  const original = process.env.FAMILY_WRITE_TOKEN;
  process.env.FAMILY_WRITE_TOKEN = "family-secret";

  assert.equal(requireWriteAuth(new Request("https://example.com", {
    headers: { "x-family-write-token": "family-secret" },
  })), null);

  if (original === undefined) {
    delete process.env.FAMILY_WRITE_TOKEN;
  } else {
    process.env.FAMILY_WRITE_TOKEN = original;
  }
});
