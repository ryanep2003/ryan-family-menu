import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard and schedule modules escape dynamic recipe attributes", async () => {
  const dashboard = await readFile(new URL("../dashboard-ui.js", import.meta.url), "utf8");
  const schedule = await readFile(new URL("../schedule-ui.js", import.meta.url), "utf8");
  const inventory = await readFile(new URL("../inventory-ui.js", import.meta.url), "utf8");

  assert.match(dashboard, /data-open="\$\{escapeHtml\(recipe\.id\)\}"/);
  assert.match(dashboard, /data-plan-favorite="\$\{escapeHtml\(recipe\.id\)\}"/);
  assert.match(dashboard, /src="\$\{escapeHtml\(recipe\.photos\[0\]\)\}"/);
  assert.match(schedule, /value="\$\{escapeHtml\(recipe\.id\)\}"/);
  assert.match(schedule, /data-open="\$\{escapeHtml\(recipe\.id\)\}"/);
  assert.match(inventory, /src="\$\{escapeHtml\(item\.photos\[0\]\)\}"/);
  assert.match(inventory, /data-stock-state="\$\{escapeHtml\(item\.id\)\}"/);
  assert.match(inventory, /data-add-inventory-to-shopping="\$\{escapeHtml\(item\.id\)\}"/);
  assert.match(inventory, /data-remove-inventory="\$\{escapeHtml\(item\.id\)\}"/);
});
