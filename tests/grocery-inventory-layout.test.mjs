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
  assert.match(app, /let inventoryFilter = "all"/);
  assert.match(html, /class="active"[^>]*data-inventory-filter="all"/);
  assert.match(styles, /\.inventory-filters \.location-filter\s*{\s*display: none;/);
  assert.match(styles, /\.inventory-location-filter\s*{\s*display: grid;/);
  assert.match(styles, /\.inventory-filter-bar\s*{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(styles, /\.inventory-filters\s*{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
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

test("mobile navigation keeps recipe creation inside Recipes", () => {
  assert.doesNotMatch(html, /data-view="add"/);
  assert.match(html, /id="addRecipeFromLibrary"/);
  assert.match(html, /id="globalAddRecipe"[^>]*data-i18n="addTab"[^>]*data-i18n-aria-label="addRecipe"/);
  assert.match(html, /id="backToRecipeLibrary"/);
  assert.match(styles, /\.tabs\s*{[\s\S]*grid-template-columns: repeat\(4, 1fr\)/);
  assert.match(app, /viewName === "add" \? "recipes" : viewName/);
  assert.match(app, /#globalAddRecipe/);
  assert.match(app, /addButton\.classList\.toggle\("active", active\)/);
});

test("mobile content clears the fixed navigation with a safe bottom buffer", () => {
  assert.match(styles, /@media \(max-width: 780px\)\s*\{[\s\S]*body\s*\{[\s\S]*padding-bottom: calc\(96px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(html, /styles\.css\?v=40/);
});

test("mobile header reserves rows for optional install controls", () => {
  assert.match(styles, /@media \(max-width: 780px\)[\s\S]*\.header-actions\s*\{[\s\S]*display: grid;[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\) auto;/);
  assert.match(styles, /\.install-prompt\s*\{[\s\S]*grid-column: 1 \/ -1;[\s\S]*grid-row: 2;/);
  assert.match(styles, /@media \(max-width: 360px\)[\s\S]*\.shell-add-button\s*\{[\s\S]*grid-row: 2;/);
});

test("file inputs use localized picker controls", () => {
  assert.match(html, /id="receiptScanPhotoInput"[^>]*data-file-action="choosePhotos"/);
  assert.match(html, /id="photoCameraInput"[^>]*data-file-action="takePhoto"/);
  assert.match(app, /function setupLocalizedFileInputs\(\)/);
  assert.match(styles, /\.localized-file-input input\[type="file"\]/);
});
