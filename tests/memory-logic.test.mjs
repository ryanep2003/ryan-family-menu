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

test("corrected dinner feedback replaces its old influence without counting legacy feedback twice", () => {
  const recipe = { id: "tacos", name: { en: "Tacos" } };
  const base = { id: "dinner-2026-09-21", dateKey: "2026-09-21", status: "cooked", items: [{ id: "main", recipeId: "tacos" }], updatedAt: "2026-09-21T20:00:00.000Z" };
  const context = { dateKey: "2026-10-10", recipeFeedback: { tacos: { loved: 1 } } };
  const loved = rankedRecipes([recipe], { ...context, events: [{ ...base, outcome: "loved" }] })[0].recommendation;
  const corrected = rankedRecipes([recipe], { ...context, events: [{ ...base, outcome: "mixed", updatedAt: "2026-09-21T21:00:00.000Z" }] })[0].recommendation;
  assert.ok(loved.score > corrected.score);
  assert.equal(corrected.reasons.includes("liked"), false);
  assert.equal(corrected.score, -1);
  assert.equal(rankedRecipes([recipe], { ...context, events: [base, { ...base, outcome: "mixed", updatedAt: "2026-09-21T21:00:00.000Z" }] })[0].recommendation.score, -1);
});

test("takeout and not-made dinners do not imply dislike or reset repeat spacing", () => {
  const recipe = { id: "tacos", name: { en: "Tacos" } };
  const event = { id: "dinner-2026-09-21", dateKey: "2026-09-21", status: "takeout", outcome: "skip", items: [{ id: "main", recipeId: "tacos" }] };
  const recommendation = rankedRecipes([recipe], { events: [event], recipeFeedback: { tacos: { loved: 1 } }, dateKey: "2026-09-22" })[0].recommendation;
  assert.equal(recommendation.score, 0);
  assert.deepEqual(recommendation.reasons, []);
});

test("recorded attendee reactions influence ranking conservatively, and restrictions still block", () => {
  const recipe = { id: "tacos", name: { en: "Chicken tacos" } };
  const base = { id: "dinner-2026-09-01", dateKey: "2026-09-01", status: "cooked", outcome: "worked", items: [{ id: "main", recipeId: "tacos" }], attendeeIds: ["m1"], reactions: { m1: "loved", m2: "disliked" } };
  const liked = rankedRecipes([recipe], { events: [base], dateKey: "2026-10-01" })[0].recommendation;
  const corrected = rankedRecipes([recipe], { events: [{ ...base, reactions: { m1: "disliked", m2: "loved" } }], dateKey: "2026-10-01" })[0].recommendation;
  assert.ok(liked.score > corrected.score);
  const members = [{ id: "m1", name: "Avery" }];
  const preferences = [{ id: "r1", memberId: "m1", kind: "restriction", value: "chicken" }];
  assert.deepEqual(rankedRecipes([recipe], { events: [base], members, preferences }), []);
});
