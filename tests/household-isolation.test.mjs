import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  cleanHouseholdName,
  createHouseholdKey,
  householdDataKey,
  householdKeyDigest,
  requireHouseholdAccess,
} from "../netlify/functions/_household.js";
import { createHouseholdStorage } from "../household-access.js";

test("household keys are high-entropy capability keys and are stored only as digests", () => {
  const key = createHouseholdKey();
  assert.match(key, /^fm_[A-Za-z0-9_-]{32}$/);
  assert.equal(householdKeyDigest(key).length, 64);
  assert.equal(householdKeyDigest(key).includes(key), false);
});

test("household data keys isolate the same record name", () => {
  assert.equal(householdDataKey("family-a", "items"), "household:family-a:items");
  assert.notEqual(householdDataKey("family-a", "items"), householdDataKey("family-b", "items"));
});

test("missing or malformed household keys fail before storage lookup", async () => {
  for (const key of ["", "too-short", "fm_not valid______________________"]) {
    const response = await requireHouseholdAccess(new Request("https://example.com", {
      headers: key ? { "x-household-key": key } : {},
    }));
    assert.equal(response.error.status, 401);
    assert.deepEqual(await response.error.json(), { error: "A valid household key is required." });
  }
});

test("browser fallbacks are scoped to a household", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const first = createHouseholdStorage(storage, "family-a");
  const second = createHouseholdStorage(storage, "family-b");
  first.setItem("dinner-groceries", "apples");
  second.setItem("dinner-groceries", "beans");
  assert.equal(first.getItem("dinner-groceries"), "apples");
  assert.equal(second.getItem("dinner-groceries"), "beans");
});

test("household names are normalized and bounded", () => {
  assert.equal(cleanHouseholdName("  The   Rivera Family  "), "The Rivera Family");
  assert.equal(cleanHouseholdName("x".repeat(100)).length, 80);
});

test("every shared data endpoint validates and namespaces household access", async () => {
  for (const file of ["family-state.js", "family-audit.js", "groceries.js", "inventory.js", "recipes.js"]) {
    const source = await readFile(new URL(`../netlify/functions/${file}`, import.meta.url), "utf8");
    assert.match(source, /requireHouseholdAccess\(request\)/, file);
    assert.match(source, /householdDataKey\(/, file);
  }
});

test("browser API requests include the household key for reads and writes", async () => {
  const source = await readFile(new URL("../api.js", import.meta.url), "utf8");
  assert.match(source, /family-menu-household-key/);
  assert.match(source, /"x-household-key"/);
  assert.match(source, /getJson[\s\S]*?headers: jsonHeaders\(\)/);
});

test("legacy migration requires a separate owner-only secret", async () => {
  const source = await readFile(new URL("../netlify/functions/households.js", import.meta.url), "utf8");
  assert.match(source, /process\.env\.LEGACY_MIGRATION_CODE/);
  assert.match(source, /Legacy migration is not authorized/);
  assert.doesNotMatch(source, /requireWriteAuth/);
});
