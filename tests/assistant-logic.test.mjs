import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyDinnerAssignments,
  assistantPreviewNeedsConfirm,
  dateKeysForAction,
  dinnerIsOccupied,
  horizonDateKeys,
  lookupDinner,
  proposeDinnerFill,
  proposeShoppingRefresh,
  remainingWeekDateKeys,
} from "../assistant-logic.js";
import { groceryItem } from "../grocery-logic.js";
import { emptyMeal, normalizeMealPlan } from "../schedule-utils.js";
import { translations } from "../translations.js";

const now = new Date("2026-09-07T15:00:00"); // Monday

const recipes = [
  { id: "tacos", name: { en: "Tacos" }, category: "main" },
  { id: "chili", name: { en: "Chili" }, category: "main" },
  { id: "roast", name: { en: "Pot roast" }, category: "main" },
  { id: "potatoes", name: { en: "Potatoes" }, category: "side" },
];

function mealWithDinner(recipeId) {
  return normalizeMealPlan({
    items: [{ id: `dinner-${recipeId}`, period: "dinner", role: "main", recipeId, sourceType: "recipe" }],
  });
}

function mealWithLunch(recipeId) {
  return normalizeMealPlan({
    items: [{ id: `lunch-${recipeId}`, period: "lunch", role: "main", recipeId, sourceType: "recipe" }],
  });
}

test("the 7-day horizon starts today and never exceeds seven dates", () => {
  const keys = horizonDateKeys(now);
  assert.deepEqual(keys, [
    "2026-09-07",
    "2026-09-08",
    "2026-09-09",
    "2026-09-10",
    "2026-09-11",
    "2026-09-12",
    "2026-09-13",
  ]);
  assert.equal(dateKeysForAction("plan-next-week", now).length, 7);
  assert.deepEqual(remainingWeekDateKeys(now), keys);
});

test("fill-gaps uses remaining current-week dates inside the 7-day horizon", () => {
  const wednesday = new Date("2026-09-09T12:00:00");
  assert.deepEqual(dateKeysForAction("fill-gaps", wednesday), [
    "2026-09-09",
    "2026-09-10",
    "2026-09-11",
    "2026-09-12",
    "2026-09-13",
  ]);
});

test("dinner occupancy ignores breakfast and lunch so those meals are not deleted", () => {
  assert.equal(dinnerIsOccupied(mealWithLunch("tacos")), false);
  assert.equal(dinnerIsOccupied(mealWithDinner("tacos")), true);
  assert.equal(dinnerIsOccupied(emptyMeal), false);
});

test("planning proposals fill only empty dinners and prefer favorites then recent wins", () => {
  const meals = {
    "2026-09-09": mealWithDinner("roast"),
    "2026-09-07": mealWithLunch("potatoes"),
  };
  const proposal = proposeDinnerFill({
    action: "plan-next-week",
    now,
    mealForDate: (dateKey) => meals[dateKey] || emptyMeal,
    recipes,
    favorites: ["tacos"],
    events: [{
      id: "dinner-2026-08-01",
      dateKey: "2026-08-01",
      status: "cooked",
      outcome: "loved",
      items: [{ id: "win", recipeId: "chili" }],
      updatedAt: "2026-08-01T20:00:00.000Z",
    }],
  });

  assert.equal(proposal.kind, "fill-dinners");
  assert.equal(proposal.occupied.length, 1);
  assert.equal(proposal.occupied[0].dateKey, "2026-09-09");
  assert.ok(!proposal.assignments.some((item) => item.dateKey === "2026-09-09"));
  assert.equal(proposal.assignments.find((item) => item.dateKey === "2026-09-07")?.recipeId, "tacos");
  assert.ok(proposal.assignments.some((item) => item.recipeId === "chili"));
  assert.ok(!proposal.assignments.some((item) => item.recipeId === "potatoes"));
  assert.equal(assistantPreviewNeedsConfirm(proposal), true);
});

test("applying dinner assignments never overwrites an occupied dinner", () => {
  const calendarMeals = {
    "2026-09-09": mealWithDinner("roast"),
  };
  const result = applyDinnerAssignments({
    calendarMeals,
    mealForDate: (dateKey) => calendarMeals[dateKey] || emptyMeal,
    assignments: [
      { dateKey: "2026-09-09", recipeId: "tacos" },
      { dateKey: "2026-09-10", recipeId: "chili" },
    ],
  });

  assert.equal(result.skipped[0].reason, "occupied");
  assert.equal(dinnerItemsRecipe(result.calendarMeals["2026-09-09"]), "roast");
  assert.equal(dinnerItemsRecipe(result.calendarMeals["2026-09-10"]), "chili");
  assert.equal(calendarMeals["2026-09-10"], undefined);
});

function dinnerItemsRecipe(meal) {
  return normalizeMealPlan(meal).items.find((item) => item.period === "dinner")?.recipeId || "";
}

test("proposing a shopping refresh does not mutate the existing list", () => {
  const existing = [groceryItem("Milk", { source: "manual" })];
  const generated = [groceryItem("Tortillas", {
    source: "meal-plan",
    mealUses: [{ dateKey: "2026-09-07", mealSlot: "dinner", recipeId: "tacos", recipeName: { en: "Tacos" } }],
  })];
  const snapshot = JSON.stringify(existing);
  const proposal = proposeShoppingRefresh({ generatedItems: generated, existingItems: existing });
  assert.equal(proposal.kind, "shopping");
  assert.equal(proposal.generatedCount, 1);
  assert.equal(proposal.listCount, 2);
  assert.equal(JSON.stringify(existing), snapshot);
  assert.equal(assistantPreviewNeedsConfirm(proposal), true);
});

test("dinner lookup answers without writing", () => {
  const lookup = lookupDinner({
    dateKey: "2026-09-07",
    todayKey: "2026-09-07",
    meal: mealWithDinner("tacos"),
  });
  assert.equal(lookup.empty, false);
  assert.equal(lookup.items[0].recipeId, "tacos");
  assert.equal(assistantPreviewNeedsConfirm(lookup), false);
});

test("assistant translation keys stay in English/Spanish parity", async () => {
  const logic = await readFile(new URL("../assistant-logic.js", import.meta.url), "utf8");
  const ui = await readFile(new URL("../assistant-ui.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const keys = [
    ...ui.matchAll(/\bt\("([^"]+)"\)/g),
    ...html.matchAll(/data-i18n="([^"]+)"/g),
    ...html.matchAll(/data-i18n-placeholder="([^"]+)"/g),
    ...html.matchAll(/data-i18n-aria-label="([^"]+)"/g),
  ].map((match) => match[1]).filter((key) => key.startsWith("assistant") || key === "assistantHelp");

  for (const key of new Set(keys)) {
    assert.ok(translations.en[key], `English missing ${key}`);
    assert.ok(translations.es[key], `Spanish missing ${key}`);
  }
  assert.equal(translations.es.assistantApply, "Aplicar");
  assert.ok(!logic.includes("openai") && !logic.includes("OpenAI"));
});
