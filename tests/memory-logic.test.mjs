import assert from "node:assert/strict";
import test from "node:test";

import {
  dinnerEventFromMeal,
  normalizeDinnerEvents,
  normalizeFamilyMembers,
  normalizeFamilyPreferences,
  normalizeFamilyRules,
  rankedRecipes,
  upsertDinnerEvent,
} from "../memory-logic.js";

test("family memory normalizes members, preferences, and bounded rules", () => {
  const members = normalizeFamilyMembers([{ id: "member-eric", name: " Eric ", role: "adult", spiceTolerance: 9 }]);
  assert.deepEqual(members[0], {
    id: "member-eric",
    name: "Eric",
    role: "adult",
    active: true,
    spiceTolerance: 3,
    updatedAt: "",
    updatedBy: "",
  });
  assert.equal(normalizeFamilyPreferences([{ id: "p1", memberId: "member-eric", kind: "dislike", value: " Fish " }], members)[0].value, "Fish");
  assert.deepEqual(normalizeFamilyRules({ repeatDays: 999, maxPastaDinners: -2 }).repeatDays, 60);
});

test("one household date keeps one editable dinner occurrence", () => {
  const first = { id: "dinner-2026-08-13", dateKey: "2026-08-13", status: "cooked", outcome: "worked", updatedAt: "2026-08-13T20:00:00.000Z" };
  const changed = { ...first, outcome: "loved", updatedAt: "2026-08-13T20:05:00.000Z" };
  const events = upsertDinnerEvent([first], changed);
  assert.equal(events.length, 1);
  assert.equal(events[0].outcome, "loved");
  assert.equal(normalizeDinnerEvents([changed, first]).length, 1);
});

test("dinner history snapshots the planned dinner and existing leftovers", () => {
  const event = dinnerEventFromMeal({
    dateKey: "2026-08-13",
    meal: {
      dinnerPace: "quick",
      items: [{ id: "meal-main", period: "dinner", role: "main", recipeId: "tacos" }],
      servingPlan: { actualLeftovers: { "meal-main": 2 } },
    },
    recipes: [{ id: "tacos", name: { en: "Tacos" } }],
    outcome: "loved",
    updatedBy: "Eric",
    memberIds: ["member-eric"],
  });
  assert.equal(event.items[0].name, "Tacos");
  assert.equal(event.leftovers["meal-main"], 2);
  assert.equal(event.pace, "quick");
});

test("recommendations exclude restrictions and favor meals that worked", () => {
  const members = normalizeFamilyMembers([{ id: "member-theo", name: "Theo", role: "child" }]);
  const preferences = normalizeFamilyPreferences([{ id: "no-fish", memberId: "member-theo", kind: "restriction", value: "fish" }], members);
  const recipes = [
    { id: "fish", name: { en: "Baked fish" } },
    { id: "tacos", name: { en: "Chicken tacos" } },
  ];
  const ranked = rankedRecipes(recipes, {
    members,
    preferences,
    events: [{ id: "old-tacos", dateKey: "2026-07-01", status: "cooked", outcome: "loved", items: [{ id: "t", recipeId: "tacos" }], updatedAt: "2026-07-01T20:00:00.000Z" }],
    dateKey: "2026-08-13",
  });
  assert.deepEqual(ranked.map(({ recipe }) => recipe.id), ["tacos"]);
  assert.ok(ranked[0].recommendation.reasons.includes("liked"));
});
