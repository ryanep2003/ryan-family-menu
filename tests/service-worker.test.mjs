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

test("service worker cache version matches the app shell script version", async () => {
  const serviceWorker = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  const cacheVersion = serviceWorker.match(/ryan-family-menu-v(\d+)/)?.[1];
  const appVersion = html.match(/app\.js\?v=(\d+)/)?.[1];

  assert.ok(cacheVersion);
  assert.equal(appVersion, cacheVersion);
});

test("service worker pre-caches first-party app modules", async () => {
  const serviceWorker = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");

  for (const path of [
    "./app.js",
    "./app-lifecycle.js",
    "./api.js",
    "./dashboard-ui.js",
    "./grocery-ui.js",
    "./inventory-ui.js",
    "./localized-data.js",
    "./recipe-form-ui.js",
    "./recipe-library-ui.js",
    "./receipt-ui.js",
    "./schedule-ui.js",
  ]) {
    assert.match(serviceWorker, new RegExp(path.replace(".", "\\.")), path);
  }
});
