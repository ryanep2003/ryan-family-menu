import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDinnerItemRole,
  applyDinnerServingField,
  assignDinnerRecipe,
  advanceDinnerSelection,
  boundedCount,
  confirmSelectedDinnerRecipe,
  dinnerIsOpen,
  dinnerMainItem,
  dinnerReviewIsReady,
  dinnerSideItem,
  filterDinnerRecipes,
  initialDinnerPickerSelection,
  parseCountableInput,
  resolveDinnerSuggestionId,
  rewriteCountFieldDisplay,
  sampleDinnerRecipes,
  selectedDinnerRecipeId,
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

test("selecting recipe A then B reviews and confirms B, not the catalog fallback", () => {
  const recipes = [
    { id: "instant-pot-pork", name: "Instant Pot Pork and Sauerkraut" },
    { id: "picadillo", name: "Picadillo" },
    { id: "carne-para-tacos", name: "Carne para tacos" },
  ];
  const fallbackById = (id) => recipes.find((recipe) => recipe.id === id) || recipes[0];

  assert.equal(fallbackById("").id, "instant-pot-pork");
  assert.equal(resolveDinnerSuggestionId(recipes, ""), "");
  assert.equal(resolveDinnerSuggestionId(recipes, "missing-upload"), "");

  let selectedId = selectedDinnerRecipeId(recipes, "picadillo");
  selectedId = selectedDinnerRecipeId(recipes, "carne-para-tacos");
  const draft = confirmSelectedDinnerRecipe({ items: [] }, recipes, selectedId);

  assert.equal(selectedId, "carne-para-tacos");
  assert.equal(dinnerMainItem(draft).recipeId, "carne-para-tacos");
  assert.notEqual(dinnerMainItem(draft).recipeId, "instant-pot-pork");
  assert.notEqual(dinnerMainItem(draft).recipeId, "picadillo");
});

test("change dinner does not preselect the existing planned recipe", () => {
  const recipes = [
    { id: "instant-pot-pork", name: "Instant Pot Pork and Sauerkraut" },
    { id: "carne-para-tacos", name: "Carne para tacos" },
  ];
  const opened = initialDinnerPickerSelection({
    recipes,
    existingRecipeId: "instant-pot-pork",
    choose: true,
  });
  assert.equal(opened.selectedId, "");
  assert.equal(opened.suggestionId, "");

  const advanced = advanceDinnerSelection(
    { items: [{ id: "dinner-1", period: "dinner", role: "main", recipeId: "instant-pot-pork" }] },
    recipes,
    "carne-para-tacos",
  );
  assert.equal(advanced.ok, true);
  assert.equal(advanced.selectedId, "carne-para-tacos");
  assert.equal(dinnerMainItem(advanced.meal).recipeId, "carne-para-tacos");
  assert.equal(advanced.meal.items.some((item) => item.recipeId === "instant-pot-pork"), false);
});

test("household upload ids longer than 120 characters still advance to review", () => {
  const longId = `shared-upload-picadillo-${"x".repeat(130)}`;
  assert.ok(longId.length > 150);
  assert.ok(longId.length <= 160);
  const recipes = [{ id: longId, name: "Picadillo Tacos", category: "main" }];
  const selectedId = selectedDinnerRecipeId(recipes, longId);
  const result = advanceDinnerSelection({ items: [] }, recipes, selectedId);
  assert.equal(result.ok, true);
  assert.equal(dinnerMainItem(result.meal).recipeId, longId);
  assert.equal(result.selectedId, longId);
  assert.equal(dinnerReviewIsReady(result.meal, recipes, result.selectedId), true);
});

test("dinner advance fails closed without a real selected id", () => {
  const recipes = [{ id: "instant-pot-pork" }, { id: "carne-para-tacos" }];
  const meal = { items: [{ id: "dinner-1", period: "dinner", role: "main", recipeId: "instant-pot-pork" }] };
  const result = advanceDinnerSelection(meal, recipes, "");
  assert.equal(result.ok, false);
  assert.equal(dinnerMainItem(result.meal).recipeId, "instant-pot-pork");
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

test("typed 2.5 in a people field becomes 2 and never 20", () => {
  const strippedDigits = (value) => Number(String(value).replace(/[^\d-]/g, ""));
  assert.equal(parseCountableInput("2.5"), 2.5);
  assert.equal(parseCountableInput("2,5"), 2.5);
  assert.equal(boundedCount("2.5"), 2);
  assert.notEqual(boundedCount("2.5"), 20);
  assert.notEqual(boundedCount("2.5"), 25);
  assert.equal(strippedDigits("2.5"), 25);
  assert.notEqual(boundedCount("2.5"), strippedDigits("2.5"));
});

test("visible count fields rewrite decimals to the stored integer", () => {
  const adults = { value: "2.5" };
  assert.equal(rewriteCountFieldDisplay(adults, "adults"), 2);
  assert.equal(adults.value, "2");
  assert.notEqual(adults.value, "20");

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
