import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDinnerItemRole,
  applyDinnerServingField,
  assignDinnerRecipe,
  dinnerIsOpen,
  dinnerMainItem,
  dinnerSideItem,
  filterDinnerRecipes,
  rewriteCountFieldDisplay,
  sampleDinnerRecipes,
  stepCountValue,
} from "../dinner-flow.js";

test("open dinner is a missing dinner main, not other meals", () => {
  assert.equal(dinnerIsOpen({ items: [] }), true);
  assert.equal(dinnerIsOpen({
    items: [{ id: "lunch-1", period: "lunch", role: "main", recipeId: "salad" }],
  }), true);
  assert.equal(dinnerIsOpen({
    items: [{ id: "dinner-1", period: "dinner", role: "main", recipeId: "pasta" }],
  }), false);
});

test("sample dinner photos prefer favorites and mains", () => {
  const samples = sampleDinnerRecipes([
    { id: "side", category: "side" },
    { id: "main-plain", category: "main" },
    { id: "favorite-main", category: "main" },
    { id: "no-photo", category: "main" },
  ], {
    favorites: ["favorite-main"],
    hasPhoto: (recipe) => recipe.id !== "no-photo",
    limit: 2,
  });
  assert.deepEqual(samples.map((recipe) => recipe.id), ["favorite-main", "main-plain"]);
});

test("dinner picker filters search, favorites, and sides", () => {
  const recipes = [
    { id: "pasta", name: "Tomato pasta", category: "main" },
    { id: "chicken", name: "Lemon chicken", category: "main" },
    { id: "rice", name: "Rice & beans", category: "side" },
  ];
  assert.deepEqual(filterDinnerRecipes(recipes, { filter: "favorites", favorites: ["chicken"] }).map((recipe) => recipe.id), ["chicken"]);
  assert.deepEqual(filterDinnerRecipes(recipes, { filter: "sides" }).map((recipe) => recipe.id), ["rice"]);
  assert.deepEqual(filterDinnerRecipes(recipes, { query: "tomato" }).map((recipe) => recipe.id), ["pasta"]);
});

test("choosing a dinner recipe replaces the main without adding a silent side", () => {
  const first = assignDinnerRecipe({ items: [] }, "pasta");
  assert.equal(dinnerMainItem(first).recipeId, "pasta");
  assert.equal(dinnerSideItem(first), null);

  const changed = assignDinnerRecipe(first, "chicken");
  assert.equal(dinnerMainItem(changed).recipeId, "chicken");
  assert.equal(dinnerMainItem(changed).id, dinnerMainItem(first).id);
  assert.equal(changed.items.filter((item) => item.period === "dinner").length, 1);
});

test("optional sides stay separate from the dinner main", () => {
  const withSide = assignDinnerRecipe(assignDinnerRecipe({ items: [] }, "pasta"), "rice", "side");
  assert.equal(dinnerMainItem(withSide).recipeId, "pasta");
  assert.equal(dinnerSideItem(withSide).recipeId, "rice");
});

test("serving-plan fields reuse bounded people and extra-serving rules", () => {
  const meal = applyDinnerServingField({
    servingPlans: { dinner: { adults: 2, kids: 2, guests: 0, extraServings: 0 } },
  }, "adults", "2.5");
  assert.equal(meal.servingPlans.dinner.adults, 2);
  assert.equal(meal.servingPlan.adults, 2);

  const extras = applyDinnerServingField(meal, "extraServings", "1.25");
  assert.equal(extras.servingPlans.dinner.extraServings, 1.5);
});

test("meal role edits stay on the chosen dinner item", () => {
  const meal = assignDinnerRecipe({ items: [] }, "pasta");
  const next = applyDinnerItemRole(meal, dinnerMainItem(meal).id, "side");
  assert.equal(dinnerMainItem(next).role, "side");
});

test("visible count fields rewrite decimals to the stored integer", () => {
  const adults = { value: "2.5" };
  assert.equal(rewriteCountFieldDisplay(adults, "adults"), 2);
  assert.equal(adults.value, "2");

  const kids = { value: "1.9" };
  assert.equal(rewriteCountFieldDisplay(kids, "kids"), 1);
  assert.equal(kids.value, "1");

  const extras = { value: "1.25" };
  assert.equal(rewriteCountFieldDisplay(extras, "extraServings"), 1.5);
  assert.equal(extras.value, "1.5");
});

test("steppers move from the normalized visible value", () => {
  assert.equal(stepCountValue("2.5", "adults", 1), 3);
  assert.equal(stepCountValue("2.5", "adults", -1), 1);
  assert.equal(stepCountValue("0", "guests", -1), 0);
});
