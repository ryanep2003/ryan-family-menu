import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("empty shopping has a primary meal-plan generator while keeping range controls", async () => {
  const ui = await readFile(new URL("../grocery-ui.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(ui, /data-open-shopping-generator/);
  assert.match(ui, /buildListFromMealPlan/);
  assert.match(html, /id="groceryPlanRange"/);
  assert.match(html, /value="next3"/);
  assert.match(html, /value="next14"/);
});
