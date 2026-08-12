import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSharedState,
  normalizeRecipeFeedback,
  persistSharedState,
  recordRecipeOutcome,
  sharedStateSnapshot,
} from "../family-state.js";

test("sharedStateSnapshot uses the API field names", () => {
  assert.deepEqual(sharedStateSnapshot({
    weekStartKey: "2026-06-22",
    schedule: { monday: { main: "pasta" } },
    calendarMeals: { "2026-06-24": { main: "soup" } },
    favorites: ["pasta"],
    tasks: [{ text: "prep" }],
    availableFood: [],
    recipeFeedback: {},
    recipeEdits: { pasta: { name: "Pasta" } },
    deletedRecipeIds: ["old"],
  }), {
    weekStart: "2026-06-22",
    schedule: { monday: { main: "pasta" } },
    calendarMeals: { "2026-06-24": { main: "soup" } },
    favorites: ["pasta"],
    tasks: [{ text: "prep" }],
    availableFood: [],
    recipeFeedback: {},
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
    availableFood: [],
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

test("recipe feedback records useful outcomes and keeps old state compatible", () => {
  const first = recordRecipeOutcome({}, "pasta", "loved", "eric", "2026-08-11T12:00:00.000Z");
  const second = recordRecipeOutcome(first, "pasta", "skip", "alyson", "2026-08-12T12:00:00.000Z");

  assert.deepEqual(second.pasta, {
    made: 1,
    loved: 1,
    repeat: 0,
    skip: 1,
    lastOutcome: "skip",
    lastMadeAt: "2026-08-11T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
    updatedBy: "alyson",
  });
  assert.deepEqual(normalizeRecipeFeedback(undefined), {});
  assert.deepEqual(normalizeRecipeFeedback({ old: { made: "bad", lastOutcome: "unknown" } }), {
    old: {
      made: 0,
      loved: 0,
      repeat: 0,
      skip: 0,
      lastOutcome: "",
      lastMadeAt: "",
      updatedAt: "",
      updatedBy: "",
    },
  });
});

test("normalizeSharedState keeps local available food when an older server omits it", () => {
  const fallback = {
    id: "local-snack",
    label: "Fruit",
    type: "snack",
    freshness: "today",
  };
  const normalized = normalizeSharedState({}, { availableFood: [fallback] });

  assert.equal(normalized.availableFood[0].id, "local-snack");
});

test("normalizeSharedState preserves the handoff detail choices", () => {
  const normalized = normalizeSharedState({
    schedule: {
      mon: {
        main: "pasta",
        handoff: {
          leftovers: true,
          leftoverServings: "two",
          leftoverUseFirst: "lunch",
          snackStatus: "ready",
          snack: "Fruit",
        },
      },
    },
    calendarMeals: {},
  }, { calendarMeals: {} });

  assert.deepEqual(normalized.schedule.mon.handoff, {
    leftovers: true,
    kidsSnack: false,
    flexible: false,
    leftoverServings: "two",
    leftoverUseFirst: "lunch",
    snackStatus: "ready",
    snack: "Fruit",
  });
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
    recipeFeedback: { pasta: { made: 2 } },
    recipeEdits: {},
    deletedRecipeIds: [],
  }, 7);

  assert.equal(writes.get("dinner-week-start"), "2026-06-22");
  assert.equal(writes.get("dinner-state-version"), "7");
  assert.equal(writes.get("dinner-favorites"), "[\"pasta\"]");
  assert.equal(writes.get("dinner-schedule"), "{\"monday\":{\"main\":\"pasta\"}}");
  assert.equal(writes.get("dinner-available-food"), "[]");
  assert.deepEqual(JSON.parse(writes.get("dinner-recipe-feedback")), {
    pasta: {
      made: 2,
      loved: 0,
      repeat: 0,
      skip: 0,
      lastOutcome: "",
      lastMadeAt: "",
      updatedAt: "",
      updatedBy: "",
    },
  });
});
