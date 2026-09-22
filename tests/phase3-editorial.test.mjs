import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const scheduleUi = await readFile(new URL("../schedule-ui.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const worker = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");

test("Phase 3 cache note stays in the service worker history", () => {
  assert.match(worker, /v201: Phase 3 calms Plan week/);
});

test("Plan week meal chips can show a small recipe thumb", () => {
  assert.match(scheduleUi, /week-day-meal-thumb/);
  assert.match(scheduleUi, /has-thumb/);
  assert.match(scheduleUi, /meal-item-thumb/);
  assert.match(styles, /\.week-day-meal-thumb/);
  assert.match(styles, /\.meal-item-thumb/);
});

test("recipe detail keeps a magazine hero and quieter secondary photos", () => {
  assert.match(styles, /\.recipe-hero \.photo-strip img:first-child\s*\{[\s\S]*aspect-ratio: 5 \/ 4/s);
  assert.match(styles, /\.recipe-hero \.photo-strip img\s*\{[\s\S]*opacity: \.88/s);
  assert.match(styles, /\.detail-title-group h2\s*\{[\s\S]*clamp\(2rem/s);
  assert.match(styles, /#ingredientList li\s*\{[\s\S]*border-bottom:/s);
  assert.match(styles, /#stepList li\s*\{[\s\S]*border-bottom:/s);
});

test("Shop and lunch tomorrow cards lose resting card chrome", () => {
  assert.match(styles, /\.grocery-section \{[^}]*box-shadow: none/);
  assert.match(styles, /\.tomorrow-lunch-card \{[^}]*background: transparent/);
});
