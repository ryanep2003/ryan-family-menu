import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("mobile week uses a glanceable two-column grid instead of horizontal scrolling", () => {
  assert.match(styles, /\.schedule-grid\s*\{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(styles, /\.schedule-grid\s*\{[\s\S]*overflow-x: visible;[\s\S]*scroll-snap-type: none;/s);
  assert.match(styles, /\.week-day-summary\s*\{\s*min-width: 0;/s);
});
