import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyDinnerItemRole,
  applyDinnerServingField,
  assignDinnerRecipe,
  advanceDinnerSelection,
  boundedCount,
  confirmSelectedDinnerRecipe,
  DEFAULT_DINNER_PICKER_MODE,
  dinnerFlowAllowsMotion,
  dinnerIsOpen,
  dinnerMainItem,
  dinnerPickerMode,
  dinnerReviewIsReady,
  dinnerSideItem,
  dinnerStageName,
  filterDinnerRecipes,
  initialDinnerPickerSelection,
  parseCountableInput,
  resolveDinnerSuggestionId,
  rewriteCountFieldDisplay,
  runDinnerStageTransition,
  sampleDinnerRecipes,
  selectedDinnerRecipeId,
  shouldAcceptDinnerReelSelection,
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

test("choose dinner replaces every leftover dinner main on a messy day", () => {
  const picadilloId = "shared-1788481879334-wuswm6";
  const recipes = [
    { id: "meatballs", name: "A 100% Chance of Meatballs" },
    { id: "instant-pot-pork", name: "Instant Pot Pork and Sauerkraut" },
    { id: "chicken-milanese", name: "Chicken Milanese" },
    { id: "pesto-pasta", name: "Pesto Pasta" },
    { id: picadilloId, name: "Picadillo Tacos" },
    { id: "green-salad", name: "Green Salad" },
    { id: "oatmeal", name: "Oatmeal" },
  ];
  const meal = {
    mealItemsVersion: 1,
    dinner: "meatballs",
    main: "meatballs",
    items: [
      { id: "d1", period: "dinner", role: "main", recipeId: "meatballs" },
      { id: "d2", period: "dinner", role: "main", recipeId: "instant-pot-pork" },
      { id: "d3", period: "dinner", role: "main", recipeId: "instant-pot-pork" },
      { id: "d4", period: "dinner", role: "main", recipeId: "chicken-milanese" },
      { id: "d5", period: "dinner", role: "main", recipeId: "pesto-pasta" },
      { id: "d6", period: "dinner", role: "salad", recipeId: "green-salad" },
      { id: "b1", period: "breakfast", role: "main", recipeId: "oatmeal" },
    ],
  };

  const result = advanceDinnerSelection(meal, recipes, picadilloId);
  assert.equal(result.ok, true);
  assert.equal(result.selectedId, picadilloId);
  assert.equal(dinnerMainItem(result.meal).recipeId, picadilloId);
  assert.equal(dinnerReviewIsReady(result.meal, recipes, result.selectedId), true);
  assert.equal(result.meal.items.filter((item) => item.period === "dinner" && item.role === "main").length, 1);
  assert.equal(result.meal.items.some((item) => item.recipeId === "meatballs"), false);
  assert.equal(result.meal.items.some((item) => item.recipeId === "instant-pot-pork"), false);
  assert.equal(result.meal.items.some((item) => item.recipeId === "green-salad" && item.role === "salad"), true);
  assert.equal(result.meal.items.some((item) => item.period === "breakfast" && item.recipeId === "oatmeal"), true);
  assert.equal(result.meal.dinner, picadilloId);
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

test("choose dinner defaults to the native field and keeps List as an opt-in", () => {
  assert.equal(DEFAULT_DINNER_PICKER_MODE, "explore");
  assert.equal(dinnerPickerMode(), "explore");
  assert.equal(dinnerPickerMode("explore"), "explore");
  assert.equal(dinnerPickerMode("list"), "list");
  assert.equal(dinnerPickerMode("camera"), "explore");
});

test("dinner stages name Today, picker, and review without inventing a fourth place", () => {
  assert.equal(dinnerStageName({}), "");
  assert.equal(dinnerStageName({ active: true, choosing: true }), "picker");
  assert.equal(dinnerStageName({ active: true, choosing: false }), "review");
});

test("change-dinner reel settle does not auto-select the planned recipe", () => {
  assert.equal(shouldAcceptDinnerReelSelection({
    nextId: "instant-pot-pork",
    selectedId: "",
    existingRecipeId: "instant-pot-pork",
    openedToChoose: true,
  }), false);
  assert.equal(shouldAcceptDinnerReelSelection({
    nextId: "picadillo",
    selectedId: "",
    existingRecipeId: "instant-pot-pork",
    openedToChoose: true,
  }), true);
  assert.equal(shouldAcceptDinnerReelSelection({
    nextId: "instant-pot-pork",
    selectedId: "picadillo",
    existingRecipeId: "instant-pot-pork",
    openedToChoose: true,
  }), true);
  assert.equal(shouldAcceptDinnerReelSelection({
    nextId: "picadillo",
    selectedId: "picadillo",
  }), false);
});

test("dinner stage motion uses view transitions only when motion is allowed", () => {
  assert.equal(dinnerFlowAllowsMotion(() => ({ matches: true })), false);
  assert.equal(dinnerFlowAllowsMotion(() => ({ matches: false })), true);
  let painted = 0;
  let started = 0;
  runDinnerStageTransition(() => {
    painted += 1;
  }, { reducedMotion: true, startViewTransition: () => { started += 1; } });
  assert.equal(painted, 1);
  assert.equal(started, 0);
  runDinnerStageTransition(() => {
    painted += 1;
  }, { reducedMotion: false, startViewTransition: (update) => { started += 1; update(); return "ok"; } });
  assert.equal(painted, 2);
  assert.equal(started, 1);
});

test("dinner field styles keep native snap and honor reduced motion", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /#focusedDinnerResults\.dinner-picker-explore\.recipe-native-reel/);
  assert.match(css, /border-radius:\s*20px/);
  assert.match(css, /@keyframes dinner-stage-enter/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*focused-dinner\.is-dinner-picker/);
  assert.doesNotMatch(css, /translate3d|perspective\(|rotateY\(/);
});
