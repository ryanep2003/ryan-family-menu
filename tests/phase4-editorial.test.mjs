import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const groceryUi = await readFile(new URL("../grocery-ui.js", import.meta.url), "utf8");
const cookUi = await readFile(new URL("../cook-along-ui.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const worker = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");

test("Phase 4 cache version is paired across shell and service worker", () => {
  assert.match(html, /styles\.css\?v=202/);
  assert.match(html, /app\.js\?v=202/);
  assert.match(worker, /ryan-family-menu-v202/);
});

test("Shop rows read as a paper list with a recipe mark only from existing photos", () => {
  assert.match(styles, /\.grocery-section \{[^}]*box-shadow: none/);
  assert.match(styles, /\.grocery-section-header h3 \{[^}]*text-transform: none/);
  assert.match(styles, /\.aisle-count \{[^}]*background: transparent/);
  assert.match(styles, /\.grocery-item-row\.is-checked \{[^}]*background: transparent/);
  assert.match(styles, /\.grocery-item-row\.is-checked \.grocery-item strong \{[^}]*text-decoration: line-through/);
  assert.match(styles, /\.grocery-qty \{[^}]*background: transparent/);
  assert.match(styles, /\.grocery-add textarea[^}]*border-radius: 0/);
  assert.match(styles, /\.grocery-item-mark \{/);
  assert.match(groceryUi, /grocery-item-mark/);
  assert.match(groceryUi, /src\.startsWith\("data:"\)/);
});

test("Cook along is a reading step instead of a boxed panel", () => {
  assert.match(styles, /\.recipe-detail \.cook-along-panel \{[^}]*border-top: 1px solid var\(--rule\)/);
  assert.match(styles, /\.cook-along-step p \{[^}]*font-family: var\(--font-reading\)/);
  assert.match(styles, /\.cook-along-actions \.ghost-button \{[^}]*border: 0/);
  assert.match(cookUi, /cook-along-kicker/);
  assert.match(cookUi, /data-cook-timer/);
  assert.match(cookUi, /data-cook-next/);
});
