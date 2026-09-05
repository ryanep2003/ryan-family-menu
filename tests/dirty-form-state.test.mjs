import assert from "node:assert/strict";
import test from "node:test";

import { createDirtyFormTracker } from "../dirty-form-state.js";

function form() {
  return {
    id: "budgetForm",
    dataset: { dirtyArea: "budget", dirtySurface: "budget" },
    classList: { add() {}, remove() {} },
  };
}

test("a completed save clears only the generation it submitted", async () => {
  const tracker = createDirtyFormTracker();
  const target = form();
  tracker.markDirtyForm(target);
  const firstSave = tracker.dirtySnapshotForSurface("budget");
  let release;
  const response = new Promise((resolve) => { release = resolve; });

  target.value = "200";
  tracker.markDirtyForm(target);
  release();
  await response;
  tracker.clearDirtySnapshot(firstSave);

  assert.equal(tracker.hasDirtySurface("budget"), true);
  assert.equal(target.dataset.dirty, "true");

  tracker.clearDirtySnapshot(tracker.dirtySnapshotForSurface("budget"));
  assert.equal(tracker.hasDirtySurface("budget"), false);
});

test("a failed or conflicted save can retry without losing the newer draft", async () => {
  const tracker = createDirtyFormTracker();
  const target = form();
  tracker.markDirtyForm(target);
  const submitted = tracker.dirtySnapshotForSurface("budget");
  const retry = Promise.resolve({ status: 409 });
  target.value = "200";
  tracker.markDirtyForm(target);
  const conflict = await retry;
  assert.equal(conflict.status, 409);
  tracker.clearDirtySnapshot(submitted);
  assert.equal(tracker.hasDirtySurface("budget"), true);

  const secondSubmitted = tracker.dirtySnapshotForSurface("budget");
  tracker.clearDirtySnapshot(secondSubmitted);
  assert.equal(tracker.hasDirtySurface("budget"), false);
});

test("a later render leaves a newer draft value untouched after an older response", () => {
  const tracker = createDirtyFormTracker();
  const target = form();
  target.value = "100";
  tracker.markDirtyForm(target);
  const submitted = tracker.dirtySnapshotForSurface("budget");
  target.value = "200";
  tracker.markDirtyForm(target);
  tracker.clearDirtySnapshot(submitted);

  const renderRemoteBudget = (value) => {
    if (!tracker.hasDirtySurface("budget")) target.value = value;
  };
  renderRemoteBudget("100");
  assert.equal(target.value, "200");
});
