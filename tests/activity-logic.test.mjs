import assert from "node:assert/strict";
import test from "node:test";

import { activityEntry, normalizeActivity } from "../activity-logic.js";

test("activity entries retain household attribution and a valid timestamp", () => {
  const entry = activityEntry("grocery", "Built the shopping list", "Eric", "2026-08-13T12:00:00.000Z");

  assert.equal(entry.type, "grocery");
  assert.equal(entry.label, "Built the shopping list");
  assert.equal(entry.updatedBy, "Eric");
  assert.equal(entry.updatedAt, "2026-08-13T12:00:00.000Z");
});

test("activity normalization rejects incomplete history and bounds retained records", () => {
  const entries = Array.from({ length: 205 }, (_, index) => ({
    id: `entry-${index}`,
    type: "meal",
    label: `Meal ${index}`,
    updatedBy: "Family",
    updatedAt: "2026-08-13T12:00:00.000Z",
  }));

  assert.equal(normalizeActivity([...entries, { id: "bad", label: "Missing time" }]).length, 200);
  assert.deepEqual(normalizeActivity([{ id: "bad", label: "Missing time" }]), []);
});
