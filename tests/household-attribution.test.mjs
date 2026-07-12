import assert from "node:assert/strict";
import test from "node:test";

import { cleanHouseholdMember } from "../household-attribution.js";
import { readFile } from "node:fs/promises";

test("household attribution preserves recognized family members", () => {
  assert.equal(cleanHouseholdMember("Eric"), "Eric");
  assert.equal(cleanHouseholdMember("Nelly"), "Nelly");
});

test("household attribution rejects unknown values", () => {
  assert.equal(cleanHouseholdMember("Untrusted"), "");
  assert.equal(cleanHouseholdMember(undefined), "");
});

test("app normalizes stored household attribution", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");

  assert.match(source, /cleanHouseholdMember\(readStringStorage\(localStorage, "dinner-household-member", "Family"\)\) \|\| "Family"/);
});
