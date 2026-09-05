import assert from "node:assert/strict";
import test from "node:test";
import { planFromWhatWeHave } from "../plan-from-what-we-have.js";

const recipes = [
  { id: "tacos", category: "main", name: { en: "Chicken tacos" }, ingredients: { en: ["chicken", "tortillas", "lime"] }, totalTime: "PT30M" },
  { id: "roast", category: "main", name: { en: "Slow roast" }, ingredients: { en: ["beef", "potatoes"] }, totalTime: "PT120M" },
  { id: "pasta", category: "main", name: { en: "Pasta" }, ingredients: { en: ["pasta", "tomatoes"] }, totalTime: "PT25M" },
  { id: "salad", category: "side", name: { en: "Salad" }, ingredients: { en: ["greens"] } },
];

test("plans up to three complete dinners from inventory and leftovers", () => {
  const result = planFromWhatWeHave({ recipes, inventory: [{ text: { en: "Chicken" }, stockState: "in" }], leftovers: [{ label: { en: "lime" }, type: "leftover" }] });
  assert.deepEqual(result.map((item) => item.recipeId), ["tacos"]);
  assert.equal(result[0].remaining[0], "tortillas");
  assert.equal(result[0].groceryImpact, "needsGroceries");
});

test("respects restrictions and prep limits", () => {
  const result = planFromWhatWeHave({ recipes, inventory: [{ text: "beef" }, { text: "potatoes" }], preferences: [{ kind: "restriction", value: "beef" }], maxPrepMinutes: 90 });
  assert.deepEqual(result, []);
});

test("returns no matches without silently changing the meal plan", () => {
  const result = planFromWhatWeHave({ recipes, inventory: [{ text: "cereal" }] });
  assert.deepEqual(result, []);
});

test("does not recommend a recipe whose allergy warning violates a family restriction", () => {
  const result = planFromWhatWeHave({
    recipes: [{
      id: "review-main",
      category: "main",
      name: { en: "Chicken" },
      ingredients: { en: ["chicken"] },
      allergyWarning: { en: "Contains peanut" },
    }],
    inventory: [{ text: "chicken" }],
    members: [{ id: "member-1", name: "Test", role: "adult" }],
    preferences: [{ id: "pref-1", memberId: "member-1", kind: "restriction", value: "peanut" }],
  });
  assert.deepEqual(result, []);
});
