import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFreshness } from "../scripts/check-fresh-main.mjs";

test("freshness preflight accepts the exact live main revision", () => {
  assert.equal(evaluateFreshness({ head: "a".repeat(40), remote: `${"a".repeat(40)}\trefs/heads/main` }).fresh, true);
});

test("freshness preflight rejects stale or unresolved revisions", () => {
  assert.equal(evaluateFreshness({ head: "a".repeat(40), remote: "b".repeat(40) }).fresh, false);
  assert.equal(evaluateFreshness({ head: "", remote: "" }).fresh, false);
});
