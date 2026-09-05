import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const schedule = await readFile(new URL("../schedule-ui.js", import.meta.url), "utf8");
const sharedSaveCoordinator = await readFile(new URL("../shared-save-coordinator.js", import.meta.url), "utf8");

test("editable surfaces are marked and remote refresh offers explicit choices", () => {
  for (const surface of ["today", "schedule", "lunches", "shopping", "budget", "inventory", "recipes", "family", "dinner"]) {
    assert.match(html, new RegExp(`data-dirty-surface="${surface}"`), surface);
  }
  assert.match(app, /document\.addEventListener\("input"/);
  assert.match(app, /document\.addEventListener\("change"/);
  assert.match(app, /pendingRemoteSharedData = data/);
  assert.match(app, /keepLocalChanges/);
  assert.match(app, /acceptRemoteChanges/);
  assert.match(app, /if \(appReady && hasDirtyArea\("shared"\) && !force\)/);
  assert.match(app, /const markDirtySurface = markDirtyForm/);
  assert.match(app, /clearDirtySnapshot\(savedDirtySnapshot\)/);
  assert.doesNotMatch(app, /markSynced\("shared"\);\s*clearDirtyArea\("shared"\)/);
});

test("independent startup collections use all-settled loading", () => {
  assert.match(app, /Promise\.allSettled\(\[\s*loadSharedRecipes\(\),\s*loadSharedState\(\),\s*loadSchedule\(\),/);
  assert.match(app, /loadLedger\("receipts"\),\s*loadLedger\("activity"\)/);
});

test("unchanged ledgers are not rewritten during a shared-state save", () => {
  assert.match(sharedSaveCoordinator, /activityDirty \? saveLedger\("activity"\) : true/);
  assert.match(sharedSaveCoordinator, /receiptsDirty \? saveLedger\("receipts"\) : true/);
  assert.match(app, /activityDirty = true/);
  assert.match(app, /receiptsDirty = true/);
});

test("Plan keeps one explicit sticky save action", () => {
  assert.match(html, /id="planSaveBarButton"[^>]*data-i18n="saveMealChanges"/);
  assert.match(schedule, /mealChangeSaving/);
  assert.match(schedule, /mealChangeSaved/);
});
