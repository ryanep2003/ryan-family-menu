import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const inventoryUi = await readFile(new URL("../inventory-ui.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("grocery list appears before occasional list tools", () => {
  assert.ok(
    html.indexOf('id="groceryList"') < html.indexOf('class="grocery-tools-menu"'),
    "the active shopping list should precede receipt and generation utilities"
  );
});

test("inventory maintenance uses one progressive disclosure", () => {
  assert.match(html, /class="inventory-tools-menu"/);
  assert.match(html, /data-i18n="inventoryManageShort"/);
  assert.match(html, /class="inventory-tools">\s*<details>/);
});

test("mobile inventory filtering keeps status visible and consolidates locations", () => {
  assert.match(html, /id="inventoryLocationFilter"/);
  assert.match(app, /inventoryLocationFilter.+addEventListener\("change"/s);
  assert.match(styles, /\.inventory-filters \.location-filter\s*{\s*display: none;/);
  assert.match(styles, /\.inventory-location-filter\s*{\s*display: grid;/);
});

test("mobile inventory rows reserve a full line for readable stock controls", () => {
  assert.match(styles, /\.inventory-item-main\s*{[\s\S]*grid-template-areas:[\s\S]*"copy menu"[\s\S]*"stock stock"/);
  assert.match(styles, /\.inventory-stock-control\s*{[\s\S]*grid-template-columns: auto minmax\(132px, 160px\)/);
  assert.match(styles, /\.stock-select\s*{[\s\S]*min-width: 132px;/);
});

test("inventory search and restock actions preserve the maintenance context", () => {
  assert.match(html, /id="inventorySearch"[^>]*type="search"/);
  assert.match(app, /inventorySearch.+addEventListener\("input"/s);
  assert.match(inventoryUi, /#inventoryStatus.+addedToShopping/);
  assert.doesNotMatch(inventoryUi, /setInventoryMode\("shopping"\)/);
});
