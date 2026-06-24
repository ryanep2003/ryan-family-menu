import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const endpoints = [
  ["recipes", "../netlify/functions/recipes.js", "MAX_REQUEST_BYTES = 2000000"],
  ["groceries", "../netlify/functions/groceries.js", "MAX_REQUEST_BYTES = 250000"],
  ["inventory", "../netlify/functions/inventory.js", "MAX_REQUEST_BYTES = 1000000"],
  ["family state", "../netlify/functions/family-state.js", "MAX_REQUEST_BYTES = 3000000"],
];

test("write endpoints use bounded JSON request parsing", async () => {
  for (const [name, path, limit] of endpoints) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");

    assert.match(source, /import \{ jsonResponse, readJsonRequest \} from "\.\/_http\.js";/, name);
    assert.match(source, new RegExp(limit), name);
    assert.match(source, /readJsonRequest\(request, \{ maxBytes: MAX_REQUEST_BYTES \}\)/, name);
    assert.doesNotMatch(source, /await request\.json\(\)/, name);
  }
});
