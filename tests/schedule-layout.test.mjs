import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("week planning preserves readable day records on narrow screens", () => {
  assert.match(styles, /\.schedule-grid\s*\{[\s\S]*grid-template-columns: repeat\(7, minmax\(8rem, 1fr\)\)/s);
  assert.match(styles, /\.schedule-grid\s*\{[\s\S]*overflow-x: auto;/s);
  assert.match(styles, /\.week-day-summary\s*\{[\s\S]*min-width: 8rem;/s);
});

test("mobile recipe search rows keep their natural height inside the scroll menu", () => {
  assert.match(styles, /\.meal-recipe-results\.is-open:not\(:empty\)\s*\{[^}]*display: block;/s);
  assert.match(styles, /\.meal-recipe-results button\s*\{[^}]*height: auto;/s);
  assert.match(styles, /\.meal-recipe-result-copy small\s*\{[^}]*-webkit-line-clamp: 2;/s);
});
