import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard and schedule modules escape dynamic recipe attributes", async () => {
  const dashboard = await readFile(new URL("../dashboard-ui.js", import.meta.url), "utf8");
  const schedule = await readFile(new URL("../schedule-ui.js", import.meta.url), "utf8");

  assert.match(dashboard, /data-open="\$\{escapeHtml\(recipe\.id\)\}"/);
  assert.match(dashboard, /data-plan-favorite="\$\{escapeHtml\(recipe\.id\)\}"/);
  assert.match(dashboard, /src="\$\{escapeHtml\(recipe\.photos\[0\]\)\}"/);
  assert.match(schedule, /value="\$\{escapeHtml\(recipe\.id\)\}"/);
  assert.match(schedule, /data-open="\$\{escapeHtml\(recipe\.id\)\}"/);
});
