import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { groceryItemsFromRecipe, replacePlannedGroceries } from "../grocery-logic.js";

import {
  approvedLunchDateKeys,
  approvedLunchFoodUses,
  completeLunchIdeas,
  emptySchoolLunches,
  generateLunch,
  generateLunchWeek,
  lunchFavoritesFor,
  lunchFoodBlockedByRestrictions,
  lunchFoodById,
  lunchPlanComplete,
  normalizeSchoolLunches,
  rateLunchFood,
  schoolWeekDateKeys,
  setLunchDayType,
  setLunchPlan,
} from "../lunch-logic.js";
const child = { id: "member-theo", name: "Theo", role: "child", active: true };

test("older household records receive an empty additive school-lunch state", async () => {
  assert.deepEqual(normalizeSchoolLunches(undefined), emptySchoolLunches());
  const endpoint = await readFile(new URL("../netlify/functions/family-state.js", import.meta.url), "utf8");
  assert.match(endpoint, /schoolLunches: normalizeSchoolLunches\(value\?\.schoolLunches\)/);
});

test("school lunch normalization keeps only bounded catalog references", () => {
  const normalized = normalizeSchoolLunches({
    plans: {
      "2026-08-24": {
        "member-theo": {
          dayType: "pack",
          components: { main: "turkey-rollups", produce: "not-real", side: "pretzels", extra: "yogurt", drink: "water" },
          approved: true,
          packedSlots: ["main", "main", "invalid"],
        },
      },
      invalid: { "member-theo": {} },
    },
  });

  assert.equal(normalized.plans.invalid, undefined);
  assert.equal(normalized.plans["2026-08-24"][child.id].components.produce, "");
  assert.deepEqual(normalized.plans["2026-08-24"][child.id].packedSlots, ["main"]);
  assert.equal(normalized.plans["2026-08-24"][child.id].approved, true);
});

test("complete lunch ideas are editable five-component starting points", () => {
  completeLunchIdeas.forEach((idea) => assert.equal(lunchPlanComplete({ components: idea.components }), true, idea.id));
});

test("generation honors explicit ratings and never-pack choices", () => {
  let state = rateLunchFood(emptySchoolLunches(), child.id, "grapes", "love");
  state = rateLunchFood(state, child.id, "water", "never");
  const lunch = generateLunch({ state, memberId: child.id, dateKey: "2026-08-25", context: { groceries: ["water bottles"] } });

  assert.equal(lunch.components.produce, "grapes");
  assert.notEqual(lunch.components.drink, "water");
});

test("generation avoids a recently approved main and uses realistic leftovers", () => {
  const recent = setLunchPlan(emptySchoolLunches(), "2026-08-24", child.id, {
    dayType: "pack",
    approved: true,
    components: completeLunchIdeas[0].components,
  });
  const next = generateLunch({ state: recent, memberId: child.id, dateKey: "2026-08-25" });
  assert.notEqual(next.components.main, "turkey-rollups");

  const leftover = generateLunch({
    state: emptySchoolLunches(),
    memberId: child.id,
    dateKey: "2026-08-25",
    context: { leftovers: ["grilled chicken from dinner"] },
  });
  assert.equal(leftover.components.main, "leftover-chicken");
});

test("family allergy language blocks matching lunch foods", () => {
  const lunch = generateLunch({
    state: emptySchoolLunches(),
    memberId: child.id,
    dateKey: "2026-08-25",
    restrictions: ["milk allergy"],
  });
  assert.ok(!["milk"].includes(lunch.components.drink));
  assert.ok(!["turkey-rollups", "ham-sandwich", "cheese-quesadilla", "mini-bagel", "mini-pizza", "cheese-crackers"].includes(lunch.components.main));
  assert.equal(lunchFoodBlockedByRestrictions("milk", ["milk allergy"]), true);
  assert.equal(lunchFoodBlockedByRestrictions("juice", ["milk allergy"]), false);
});

test("generation leaves a slot empty instead of bypassing impossible safety constraints", () => {
  const lunch = generateLunch({
    state: emptySchoolLunches(),
    memberId: child.id,
    dateKey: "2026-08-25",
    restrictions: ["dairy allergy", "wheat allergy", "egg allergy"],
  });

  assert.equal(lunch.components.main, "");
  assert.equal(lunchPlanComplete(lunch), false);
});

test("generation honors lunchbox preparation and cold-storage constraints", () => {
  const lunch = generateLunch({
    state: emptySchoolLunches(),
    memberId: child.id,
    dateKey: "2026-08-25",
    settings: { maxPrepMinutes: 5, coldPack: false, reheat: false },
  });

  Object.values(lunch.components).forEach((foodId) => {
    const food = lunchFoodById(foodId);
    assert.ok(food.prepMinutes <= 5);
    assert.notEqual(food.needsCold, true);
    assert.notEqual(food.needsHeat, true);
  });
});

test("fill my week preserves no-packing days and avoids consecutive mains", () => {
  const dates = schoolWeekDateKeys(new Date("2026-08-24T12:00:00"));
  let special = setLunchDayType(emptySchoolLunches(), dates[4], child.id, "school-lunch");
  special = setLunchPlan(special, dates[0], child.id, {
    dayType: "pack",
    approved: true,
    components: completeLunchIdeas[0].components,
  });
  const filled = generateLunchWeek({ state: special, members: [child], dateKeys: dates });
  const mains = dates.slice(0, 4).map((dateKey) => filled.plans[dateKey][child.id].components.main);

  assert.equal(filled.plans[dates[4]][child.id].dayType, "school-lunch");
  assert.equal(filled.plans[dates[0]][child.id].approved, true);
  assert.equal(filled.plans[dates[0]][child.id].components.main, completeLunchIdeas[0].components.main);
  mains.slice(1).forEach((main, index) => assert.notEqual(main, mains[index]));
});

test("weekend planning opens the upcoming school week", () => {
  assert.equal(schoolWeekDateKeys(new Date("2026-08-23T12:00:00"))[0], "2026-08-24");
  assert.equal(schoolWeekDateKeys(new Date("2026-08-22T12:00:00"))[0], "2026-08-24");
});

test("approved lunches progressively surface favorites and grocery uses", () => {
  let state = emptySchoolLunches();
  for (const dateKey of ["2026-08-24", "2026-08-25"]) {
    state = setLunchPlan(state, dateKey, child.id, {
      dayType: "pack",
      approved: true,
      components: completeLunchIdeas[0].components,
    });
  }

  const favorites = lunchFavoritesFor(state, child.id);
  assert.equal(favorites[0].count, 2);
  const uses = approvedLunchFoodUses(state, ["2026-08-24", "2026-08-25"], [child]);
  assert.ok(uses.length > 5);
  assert.ok(uses.every((use) => use.memberName === "Theo" && use.food.groceries.en.length));
  assert.deepEqual(approvedLunchDateKeys(state, { from: "2026-08-25", to: "2026-09-01" }), ["2026-08-25"]);
});

test("lunch ingredients consolidate with dinner groceries and retain their reasons", () => {
  const dinnerRecipe = {
    id: "family-breakfast",
    name: { en: "Family breakfast", es: "Desayuno familiar" },
    ingredients: { en: ["1 container strawberries"], es: ["1 envase de fresas"] },
  };
  const lunchRecipe = {
    id: "school-lunch-member-theo-strawberries",
    name: { en: "Theo lunches", es: "Almuerzos de Theo" },
    ingredients: { en: ["0.2 container strawberries"], es: ["0.2 envase de fresas"] },
  };
  const dinner = groceryItemsFromRecipe(dinnerRecipe, "en", [], "Family", {
    dateKey: "2026-08-24", mealSlot: "breakfast", recipeId: dinnerRecipe.id, recipeName: dinnerRecipe.name,
  }).map((item) => ({ ...item, source: "meal-plan" }));
  const lunch = groceryItemsFromRecipe(lunchRecipe, "en", [], "Family", {
    dateKey: "2026-08-25", mealSlot: "lunch", recipeId: lunchRecipe.id, recipeName: lunchRecipe.name,
  }).map((item) => ({ ...item, source: "meal-plan" }));

  const [strawberries] = replacePlannedGroceries([], [...dinner, ...lunch]);

  assert.equal(strawberries.plannedQuantities.en, 1.2);
  assert.deepEqual(strawberries.mealUses.map((use) => use.recipeName.en), ["Family breakfast", "Theo lunches"]);
});
