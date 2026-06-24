import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSharedState,
  persistSharedState,
  sharedStateSnapshot,
} from "../family-state.js";

test("sharedStateSnapshot uses the API field names", () => {
  assert.deepEqual(sharedStateSnapshot({
    weekStartKey: "2026-06-22",
    schedule: { monday: { main: "pasta" } },
    calendarMeals: { "2026-06-24": { main: "soup" } },
    favorites: ["pasta"],
    tasks: [{ text: "prep" }],
    recipeEdits: { pasta: { name: "Pasta" } },
    deletedRecipeIds: ["old"],
  }), {
    weekStart: "2026-06-22",
    schedule: { monday: { main: "pasta" } },
    calendarMeals: { "2026-06-24": { main: "soup" } },
    favorites: ["pasta"],
    tasks: [{ text: "prep" }],
    recipeEdits: { pasta: { name: "Pasta" } },
    deletedRecipeIds: ["old"],
  });
});

test("normalizeSharedState preserves remote collections and fallback metadata", () => {
  const normalized = normalizeSharedState({
    schedule: { mon: { main: "pasta" } },
    favorites: ["pasta"],
    tasks: [{ text: "shop" }],
    recipeEdits: { pasta: { name: "Pasta" } },
    deletedRecipeIds: ["old"],
  }, {
    weekStartKey: "2026-06-22",
    calendarMeals: {},
    favorites: [],
    tasks: [],
    recipeEdits: {},
    deletedRecipeIds: [],
  });

  assert.equal(normalized.weekStartKey, "2026-06-22");
  assert.equal(normalized.schedule.mon.main, "pasta");
  assert.deepEqual(normalized.favorites, ["pasta"]);
  assert.deepEqual(normalized.tasks, [{ text: "shop" }]);
  assert.deepEqual(normalized.recipeEdits, { pasta: { name: "Pasta" } });
  assert.deepEqual(normalized.deletedRecipeIds, ["old"]);
});

test("persistSharedState writes the local storage keys", () => {
  const writes = new Map();
  const storage = {
    setItem(key, value) {
      writes.set(key, value);
    },
  };

  persistSharedState(storage, {
    weekStartKey: "2026-06-22",
    schedule: { monday: { main: "pasta" } },
    calendarMeals: {},
    favorites: ["pasta"],
    tasks: [],
    recipeEdits: {},
    deletedRecipeIds: [],
  }, 7);

  assert.equal(writes.get("dinner-week-start"), "2026-06-22");
  assert.equal(writes.get("dinner-state-version"), "7");
  assert.equal(writes.get("dinner-favorites"), "[\"pasta\"]");
  assert.equal(writes.get("dinner-schedule"), "{\"monday\":{\"main\":\"pasta\"}}");
});
