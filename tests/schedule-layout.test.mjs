import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("week planning stacks days in the page width without horizontal overflow", () => {
  const gridRule = styles.match(/\.schedule-grid\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(gridRule, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(gridRule, /overflow-x: hidden/);
  assert.doesNotMatch(gridRule, /overflow-x:\s*auto/);
  assert.match(styles, /\.week-day-card\s*\{[\s\S]*min-width: 0;/s);
});

test("mobile recipe search rows keep their natural height in the page scroll", () => {
  assert.match(styles, /\.meal-recipe-results\.is-open:not\(:empty\)\s*\{[^}]*display: block;/s);
  assert.doesNotMatch(styles, /\.meal-recipe-results\.is-open:not\(:empty\)\s*\{[^}]*(?:max-height|overflow-y):/s);
  assert.match(styles, /\.meal-recipe-results button\s*\{[^}]*height: auto;/s);
  assert.match(styles, /\.meal-recipe-result-copy small\s*\{[^}]*-webkit-line-clamp: 2;/s);
});
