import assert from "node:assert/strict";
import test from "node:test";
import { previewDinnerAttendanceChange, previewQuickDinnerReplacement, quickDinnerAlternatives } from "../change-of-plans-logic.js";

test("attendance preview changes only dinner servings and identifies changed recipe batches", () => {
  const meal = {
    mealItemsVersion: 1,
    items: [
      { id: "breakfast", period: "breakfast", role: "main", sourceType: "recipe", recipeId: "eggs" },
      { id: "dinner", period: "dinner", role: "main", sourceType: "recipe", recipeId: "pasta" },
      { id: "side", period: "dinner", role: "side", sourceType: "recipe", recipeId: "salad" },
    ],
    notes: "Keep the side",
    servingPlans: {
      breakfast: { adults: 1, kids: 0, guests: 0 },
      dinner: { adults: 2, kids: 2, guests: 0, extraServings: 0 },
    },
  };
  const snapshot = structuredClone(meal);
  const preview = previewDinnerAttendanceChange({
    dateKey: "2026-09-30", meal, attendance: { adults: 4, kids: 2, guests: 1 },
    recipes: [
      { id: "pasta", servings: 4, ingredients: { en: ["1 lb pasta"] } },
      { id: "salad", servings: 8, ingredients: { en: ["1 head lettuce"] } },
    ],
  });
  assert.deepEqual(meal, snapshot);
  assert.equal(preview.beforeServings, 3);
  assert.equal(preview.afterServings, 6);
  assert.equal(preview.after.notes, "Keep the side");
  assert.deepEqual(preview.after.items, preview.before.items);
  assert.equal(preview.after.servingPlans.breakfast.adults, 1);
  assert.equal(preview.after.servingPlans.dinner.guests, 1);
  assert.equal(preview.after.servingPlan.guests, 1);
  assert.deepEqual(preview.groceryContributions.map(({ recipeId, beforeBatches, afterBatches }) =>
    [recipeId, beforeBatches, afterBatches]), [["pasta", 0.75, 1.5], ["salad", 0.5, 0.75]]);
  assert.deepEqual(preview.groceryContributions[0].ingredients[0], {
    index: 0, before: { en: "3/4 lb pasta" }, after: { en: "1 1/2 lb pasta" }, quantityKnown: true,
  });
  assert.equal(preview.needsShoppingReview, true);
});

test("attendance preview rejects impossible dates and attendance", () => {
  assert.throws(() => previewDinnerAttendanceChange({ dateKey: "2026-09-31", attendance: { adults: 1, kids: 0, guests: 0 } }));
  assert.throws(() => previewDinnerAttendanceChange({ dateKey: "2026-10-01", attendance: { adults: 21, kids: 0, guests: 0 } }));
});

test("quick alternatives require known time and ingredients and leave a manual choice", () => {
  const result = quickDinnerAlternatives({
    dateKey: "2026-10-01", meal: { dinner: "slow" }, maxMinutes: 30,
    recipes: [
      { id: "slow", category: "main", meta: "Serves 4 · 20 min", ingredients: { en: ["rice"] } },
      { id: "quick", category: "main", meta: { en: "25 min", es: "25 minutos" }, ingredients: { en: ["beans"] } },
      { id: "unknown", category: "main", ingredients: { en: ["beans"] } },
      { id: "empty", category: "main", meta: "15 min", ingredients: { en: ["Add ingredients after review"] } },
      { id: "side", category: "side", meta: "10 min", ingredients: { en: ["lettuce"] } },
      { id: "late", category: "main", meta: "50 min", ingredients: { en: ["beans"] } },
    ],
  });
  assert.equal(result.currentRecipeId, "slow");
  assert.deepEqual(result.options.map((option) => option.recipeId), ["quick"]);
  assert.equal(result.manualNoCooking, true);
  assert.deepEqual(quickDinnerAlternatives({ dateKey: "2026-10-01", meal: {}, maxMinutes: 30,
    recipes: [{ id: "quick", category: "main", meta: "20 min", ingredients: { en: ["beans"] } }] }).options, []);
});

test("quick swap keeps dinner item identity, sides, lunch, servings, and ingredient evidence", () => {
  const meal = {
    mealItemsVersion: 1,
    items: [
      { id: "lunch", period: "lunch", role: "main", recipeId: "sandwich" },
      { id: "main", period: "dinner", role: "main", recipeId: "slow" },
      { id: "side", period: "dinner", role: "side", recipeId: "salad" },
    ],
    notes: "Family night", servingPlan: { adults: 2, kids: 2, guests: 0 },
  };
  const snapshot = structuredClone(meal);
  const result = previewQuickDinnerReplacement({ dateKey: "2026-09-30", meal, recipeId: "quick", recipes: [
    { id: "slow", servings: 4, ingredients: { en: ["1 lb pasta"] } },
    { id: "quick", servings: 4, ingredients: { en: ["2 cups rice"] } },
  ] });
  assert.deepEqual(meal, snapshot);
  assert.equal(result.after.dinner, "quick");
  assert.equal(result.after.lunch, "sandwich");
  assert.equal(result.after.side, "salad");
  assert.equal(result.after.items.find((item) => item.id === "main").recipeId, "quick");
  assert.equal(result.after.notes, "Family night");
  assert.deepEqual(result.after.servingPlans, result.before.servingPlans);
  assert.equal(result.beforeContribution.ingredients[0].before.en, "3/4 lb pasta");
  assert.equal(result.afterContribution.ingredients[0].before.en, "1 1/2 cups rice");
  assert.throws(() => previewQuickDinnerReplacement({ dateKey: "2026-09-30", meal, recipeId: "missing", recipes: [] }));
});
