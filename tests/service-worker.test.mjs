import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("service worker pre-caches the complete first-party import graph", async () => {
  const root = new URL("../", import.meta.url);
  const worker = await readFile(new URL("service-worker.js", root), "utf8");
  const assetList = worker.slice(worker.indexOf("const ASSETS"), worker.indexOf("];"));
  const cached = new Set([...assetList.matchAll(/"(\.\/[^\"]*)"/g)].map((match) => new URL(match[1], root).href));
  const pending = [new URL("app.js", root)];
  const visited = new Set();
  while (pending.length) {
    const module = pending.pop();
    module.search = "";
    module.hash = "";
    if (visited.has(module.href)) continue;
    visited.add(module.href);
    assert.ok(cached.has(module.href), `Missing pre-cache entry: ${module.pathname.split("/").pop()}`);
    const source = await readFile(module, "utf8");
    for (const match of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) {
      pending.push(new URL(match[1], module));
    }
  }
});

test("service worker reuses cached static assets before requesting the network", async () => {
  const source = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");

  assert.match(source, /url\.origin !== self\.location\.origin/);
  assert.match(source, /const cached = await caches\.match\(event\.request\);\s*if \(cached\) return cached;/);
  assert.match(source, /response\.ok && response\.type === "basic"/);
  assert.match(source, /event\.waitUntil\(caches\.open\(CACHE_NAME\)/);
  assert.match(source, /return caches\.match\("\.\/index\.html"\)/);
});

test("service worker cache version matches the app shell script version", async () => {
  const serviceWorker = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  const cacheVersion = serviceWorker.match(/ryan-family-menu-v(\d+)/)?.[1];
  const appVersion = html.match(/app\.js\?v=(\d+)/)?.[1];
  const stylesVersion = html.match(/styles\.css\?v=(\d+)/)?.[1];

  assert.ok(cacheVersion);
  assert.equal(appVersion, cacheVersion);
  assert.equal(stylesVersion, cacheVersion);
});

test("service worker pre-caches first-party app modules", async () => {
  const serviceWorker = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");

  for (const path of [
    "./app.js",
    "./cook-along-ui.js",
    "./app-lifecycle.js",
    "./available-food.js",
    "./api.js",
    "./dashboard-ui.js",
    "./activity-logic.js",
    "./activity-ui.js",
    "./audit-logic.js",
    "./audit-ui.js",
    "./budget-logic.js",
    "./budget-ui.js",
    "./family-state.js",
    "./family-ui.js",
    "./handoff-ui.js",
    "./memory-logic.js",
    "./grocery-ui.js",
    "./inventory-ui.js",
    "./lunch-ui.js",
    "./lunch-logic.js",
    "./localized-data.js",
    "./recipe-form-ui.js",
    "./recipe-library-ui.js",
    "./receipt-ui.js",
    "./schedule-ui.js",
    "./assistant-logic.js",
    "./assistant-ui.js",
    "./shared-state-loader.js",
    "./shared-state-authority.js",
    "./dirty-form-state.js",
    "./shared-save-coordinator.js",
  ]) {
    assert.match(serviceWorker, new RegExp(path.replace(".", "\\.")), path);
  }
});
