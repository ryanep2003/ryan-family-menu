import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("Plan week keeps rule separators and photo-aware meal chips", () => {
  assert.match(styles, /\.week-day-card\s*\{[\s\S]*border-bottom: 1px solid var\(--rule\)/s);
  assert.match(styles, /\.week-day-label strong\s*\{[\s\S]*font-family: var\(--font-reading\)/s);
  assert.match(styles, /\.week-day-meal-thumb/);
  assert.match(styles, /\.week-day-add \{[^}]*background: var\(--soft-blue\)/);
});

test("week planning stacks days in the page width without horizontal overflow", () => {
  const gridRule = styles.match(/\.schedule-grid\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(gridRule, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(gridRule, /overflow-x: hidden/);
  assert.doesNotMatch(gridRule, /overflow-x:\s*auto/);
  assert.match(styles, /\.week-day-card\s*\{[\s\S]*min-width: 0;/s);
});

test("meal recipe browse grows in the page instead of a nested scroller", () => {
  assert.match(styles, /\[data-meal-recipe-results\]:not\(\.is-open\)\s*\{[^}]*display:\s*none;/s);
  assert.doesNotMatch(styles, /\[data-meal-recipe-results\][^{]*\{[^}]*(?:max-height|overflow-y):/s);
  assert.match(styles, /\.library-browse-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /\.library-grid-card h3\s*\{[^}]*-webkit-line-clamp:\s*2;/s);
});
