import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("month calendar has seven columns, useful states, and keyboard date selection", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const schedule = await readFile(new URL("../schedule-ui.js", import.meta.url), "utf8");
  assert.match(styles, /\.calendar-weekdays[\s\S]*grid-template-columns:\s*repeat\(7/);
  assert.match(styles, /\.calendar-grid[\s\S]*grid-template-columns:\s*repeat\(7/);
  for (const state of ["today", "selected", "outside-month", "has-meal"]) assert.match(styles, new RegExp(`\\.calendar-day\\.${state}`));
  assert.match(html, /id="calendarGrid" role="grid"/);
  assert.match(schedule, /aria-selected="\$\{isSelected\}"/);
  assert.match(schedule, /aria-current="date"/);
  assert.match(schedule, /ArrowLeft[\s\S]*ArrowRight[\s\S]*ArrowUp[\s\S]*ArrowDown/);
  assert.doesNotMatch(schedule, /data-edit-calendar-date="[^\"]+"[^>]*aria-pressed/);
});
