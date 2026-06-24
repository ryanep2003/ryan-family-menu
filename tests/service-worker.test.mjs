import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("service worker only runtime-caches successful same-origin responses", async () => {
  const source = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");

  assert.match(source, /url\.origin !== self\.location\.origin/);
  assert.match(source, /response\.ok && response\.type === "basic"/);
  assert.match(source, /event\.waitUntil\(caches\.open\(CACHE_NAME\)/);
  assert.match(source, /cached \|\| caches\.match\("\.\/index\.html"\)/);
});
