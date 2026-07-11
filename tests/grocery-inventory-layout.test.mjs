import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("grocery list appears before occasional list tools", () => {
  assert.ok(
    html.indexOf('id="groceryList"') < html.indexOf('class="grocery-tools-menu"'),
    "the active shopping list should precede receipt and generation utilities"
  );
});

test("inventory maintenance uses one progressive disclosure", () => {
  assert.match(html, /class="inventory-tools-menu"/);
  assert.match(html, /data-i18n="manageInventory"/);
  assert.match(html, /class="inventory-tools">\s*<details>/);
});

test("mobile inventory filtering keeps status visible and consolidates locations", () => {
  assert.match(html, /id="inventoryLocationFilter"/);
  assert.match(app, /inventoryLocationFilter.+addEventListener\("change"/s);
  assert.match(styles, /\.inventory-filters \.location-filter\s*{\s*display: none;/);
  assert.match(styles, /\.inventory-location-filter\s*{\s*display: grid;/);
});
