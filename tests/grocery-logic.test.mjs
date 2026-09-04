import test from "node:test";
import assert from "node:assert/strict";

import {
  applyInventoryCoverage,
  cleanIngredientForGrocery,
  formatCompactGroceryMealCue,
  groceryAisleFor,
  groceryItem,
  groceryItemsFromRecipe,
  groceryMealRowState,
  groceryRowParts,
  inventoryMatchFor,
  mergeGroceries,
  parseIngredientAmount,
  replacePlannedGroceries,
  scaleIngredientText,
} from "../grocery-logic.js";

test("ingredient quantities scale with the planned recipe batch", () => {
  assert.deepEqual(parseIngredientAmount("1 1/2 cups rice"), { quantity: 1.5, remainder: "cups rice" });
  assert.equal(scaleIngredientText("2 cups rice", 1.25), "2 1/2 cups rice");
  assert.equal(scaleIngredientText("Salt to taste", 1.5), "Salt to taste");
});

test("inventoryMatchFor ignores low and out stock by default", () => {
  const inventory = [
    { text: "lemons", stockState: "low" },
    { text: "whole milk", stockState: "some" },
  ];

  assert.equal(inventoryMatchFor(inventory, "4 lemons"), null);
  assert.deepEqual(
    inventoryMatchFor(inventory, "1 cup whole milk"),
    inventory[1],
  );
});

test("groceryItemsFromRecipe flags possible inventory matches without hiding them", () => {
  const recipe = {
    id: "lemon-chicken",
    name: { en: "Lemon Chicken", es: "Pollo al limon" },
    ingredients: {
      en: ["4 lemons", "1 cup olive oil"],
      es: ["4 limones", "1 taza de aceite de oliva"],
    },
  };
  const inventory = [{ text: "lemons", stockState: "full" }];

  const items = groceryItemsFromRecipe(recipe, "en", inventory);

  assert.equal(items.length, 2);
  assert.equal(items[0].recipeId, "lemon-chicken");
  assert.deepEqual(items[0].recipeName, { en: "Lemon Chicken", es: "Pollo al limon" });
  assert.equal(items[0].inInventory, false);
  assert.equal(items[0].inventorySuggested, true);
  assert.equal(items[0].inventoryDecision, "review");
  assert.equal(items[0].checked, false);
  assert.deepEqual(items[0].text, { en: "4 lemons", es: "4 limones" });
  assert.equal(items[1].inInventory, false);
});

test("groceryItemsFromRecipe skips serving headers and cooking-instruction paste", () => {
  const recipe = {
    id: "panko-fish",
    name: { en: "Panko fish" },
    ingredients: {
      en: [
        "Para ~4–6 filetes:",
        "4 garlic cloves (roughly chopped)",
        "Dip each fillet in the egg, then coat with panko breadcrumbs until fully covered",
        "1 cup panko breadcrumbs",
        "lemon (cut into wedges/sliced for serving)",
      ],
    },
  };

  const items = groceryItemsFromRecipe(recipe, "en", []);
  const names = items.map((item) => groceryRowParts(item.text.en).name);

  assert.deepEqual(names, ["garlic cloves", "panko breadcrumbs", "lemon"]);
  assert.ok(items.every((item) => !/para ~|filetes|dip each|coat with/i.test(item.text.en)));
});

test("groceryItemsFromRecipe records the meal that will use an ingredient", () => {
  const recipe = {
    id: "bean-salad",
    name: { en: "Bean Salad", es: "Ensalada de frijoles" },
    ingredients: { en: ["1 bunch cilantro"], es: ["1 manojo de cilantro"] },
  };

  const items = groceryItemsFromRecipe(recipe, "en", [], "Family", {
    dateKey: "2026-07-22",
    mealSlot: "lunch",
    recipeId: recipe.id,
    recipeName: recipe.name,
  });

  assert.deepEqual(items[0].mealUses, [{
    dateKey: "2026-07-22",
    mealSlot: "lunch",
    recipeId: "bean-salad",
    recipeName: recipe.name,
  }]);
});

test("mergeGroceries avoids duplicate ingredient rows", () => {
  const existing = [
    groceryItem("4 lemons", { source: "manual" }),
  ];
  const incoming = [
    groceryItem("4 lemons", { source: "recipe-detail" }),
    groceryItem("1 cup olive oil", { source: "recipe-detail" }),
  ];

  const merged = mergeGroceries(existing, incoming);

  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0].text, { en: "4 lemons" });
  assert.deepEqual(merged[1].text, { en: "1 cup olive oil" });
});

test("mergeGroceries keeps the meals that share a spillover ingredient", () => {
  const existing = groceryItem("1 bunch cilantro", {
    source: "week-plan",
    mealUses: [{
      dateKey: "2026-07-20",
      mealSlot: "dinner",
      recipeId: "tacos",
      recipeName: { en: "Tacos" },
    }],
  });
  const incoming = groceryItem("1 bunch cilantro", {
    source: "week-plan",
    mealUses: [{
      dateKey: "2026-07-22",
      mealSlot: "lunch",
      recipeId: "salad",
      recipeName: { en: "Herb salad" },
    }],
  });

  const merged = mergeGroceries([existing], [incoming]);

  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].mealUses.map((use) => [use.dateKey, use.mealSlot]), [
    ["2026-07-20", "dinner"],
    ["2026-07-22", "lunch"],
  ]);
});

test("mergeGroceries totals compatible planned ingredient quantities", () => {
  const recipe = {
    id: "onion-dish",
    name: { en: "Onion Dish" },
    ingredients: { en: ["1 onion"] },
  };
  const first = groceryItemsFromRecipe(recipe, "en", [], "Family", {
    dateKey: "2026-08-13", mealSlot: "dinner", recipeId: recipe.id, recipeName: recipe.name,
  }, 1);
  const second = groceryItemsFromRecipe(recipe, "en", [], "Family", {
    dateKey: "2026-08-14", mealSlot: "lunch", recipeId: recipe.id, recipeName: recipe.name,
  }, 0.5);
  const [merged] = mergeGroceries(first, second);

  assert.deepEqual(merged.text, { en: "1 1/2 onion" });
  assert.equal(merged.plannedQuantities.en, 1.5);
});

test("generating the same planned meal twice does not double its quantity", () => {
  const recipe = { id: "rice", name: { en: "Rice" }, ingredients: { en: ["1 cup rice"] } };
  const use = { dateKey: "2026-08-13", mealSlot: "dinner", recipeId: recipe.id, recipeName: recipe.name };
  const generated = groceryItemsFromRecipe(recipe, "en", [], "Family", use, 1.25);
  const [merged] = mergeGroceries(generated, generated);

  assert.equal(merged.plannedQuantities.en, 1.25);
  assert.deepEqual(merged.text, { en: "1 1/4 cup rice" });
});

test("rebuilding a plan replaces stale quantities while preserving manual items", () => {
  const recipe = { id: "rice", name: { en: "Rice" }, ingredients: { en: ["1 cup rice"] } };
  const use = { dateKey: "2026-08-13", mealSlot: "dinner", recipeId: recipe.id, recipeName: recipe.name };
  const first = groceryItemsFromRecipe(recipe, "en", [], "Family", use, 1)[0];
  first.source = "meal-plan";
  const updated = groceryItemsFromRecipe(recipe, "en", [], "Family", use, 2)[0];
  updated.source = "meal-plan";
  const manual = groceryItem("Milk", { source: "manual" });

  const rebuilt = replacePlannedGroceries([manual, first], [updated]);

  assert.equal(rebuilt.length, 2);
  assert.equal(rebuilt.find((item) => item.source === "meal-plan").plannedQuantities.en, 2);
  assert.ok(rebuilt.some((item) => item.source === "manual"));
});

test("the first rebuilt plan removes legacy week-plan rows", () => {
  const legacy = groceryItem("1 cup rice", { source: "week-plan" });
  const current = groceryItem("2 cups rice", { source: "meal-plan" });

  const rebuilt = replacePlannedGroceries([legacy], [current]);

  assert.equal(rebuilt.length, 1);
  assert.equal(rebuilt[0].source, "meal-plan");
});

test("rebuilding a month remains idempotent beyond twelve shared uses", () => {
  const recipe = { id: "rice", name: { en: "Rice" }, ingredients: { en: ["1 cup rice"] } };
  const generated = Array.from({ length: 14 }, (_, index) => groceryItemsFromRecipe(recipe, "en", [], "Family", {
    dateKey: `2026-08-${`${index + 1}`.padStart(2, "0")}`,
    mealSlot: "dinner",
    recipeId: recipe.id,
    recipeName: recipe.name,
  }, 1)[0]);
  generated.forEach((item) => { item.source = "meal-plan"; });

  const first = replacePlannedGroceries([], generated);
  const second = replacePlannedGroceries(first, generated);

  assert.equal(first[0].plannedQuantities.en, 14);
  assert.equal(second[0].plannedQuantities.en, 14);
});

test("structured inventory stays advisory until the shopper confirms it", () => {
  const recipe = { id: "lemonade", name: { en: "Lemonade" }, ingredients: { en: ["4 lemons"] } };
  const [planned] = groceryItemsFromRecipe(recipe, "en", [], "Family", {
    dateKey: "2026-08-13", mealSlot: "dinner", recipeId: recipe.id, recipeName: recipe.name,
  }, 1);
  const [partial] = applyInventoryCoverage([planned], [{
    text: { en: "lemons" }, stockState: "some", amount: 2, unit: "each",
  }]);

  assert.equal(partial.checked, false);
  assert.equal(partial.inInventory, false);
  assert.equal(partial.inventorySuggested, true);
  assert.equal(partial.inventoryDecision, "review");
  assert.equal(partial.remainingQuantities.en, 2);
  assert.deepEqual(partial.text, { en: "4 lemons" });

  const [covered] = applyInventoryCoverage([planned], [{
    text: { en: "lemons" }, stockState: "full", amount: 4, unit: "each",
  }]);
  assert.equal(covered.checked, false);
  assert.equal(covered.inventoryDecision, "review");
  assert.equal(covered.remainingQuantities.en, 0);
});

test("groceryItem records optional household attribution", () => {
  const item = groceryItem("Milk", { updatedBy: "Eric" });

  assert.equal(item.updatedBy, "Eric");
  assert.ok(item.updatedAt);
});

test("grocery names drop markdown markers and split quantity badges", () => {
  assert.equal(cleanIngredientForGrocery("**4 lemons**"), "4 lemons");
  assert.equal(cleanIngredientForGrocery("# Garlic"), "Garlic");
  assert.deepEqual(groceryRowParts("4 lemons"), { name: "lemons", quantityLabel: "4" });
  assert.equal(groceryAisleFor("spinach"), "produce");
  assert.equal(groceryAisleFor("whole milk"), "dairy");
  assert.equal(groceryAisleFor("olive oil"), "pantry");
});

test("grocery names drop recipe headers, serving lines, and prep parentheses", () => {
  assert.equal(cleanIngredientForGrocery("### Ingredients\n* crushed red pepper"), "crushed red pepper");
  assert.equal(
    cleanIngredientForGrocery("Yogurt Marinated Grilled Chicken Skewers\nIngredients:\n- 1 tsp crushed red pepper"),
    "1 tsp crushed red pepper",
  );
  assert.equal(cleanIngredientForGrocery("Ingredientes:\n**ajo**"), "ajo");
  assert.equal(cleanIngredientForGrocery("Para ~4–6 filetes:"), "");
  assert.equal(cleanIngredientForGrocery("For ~4-6 steaks:"), "");
  assert.equal(
    cleanIngredientForGrocery("Dip each fillet in the egg, then coat with panko breadcrumbs until fully covered"),
    "",
  );
  assert.equal(cleanIngredientForGrocery("garlic cloves (roughly chopped)"), "garlic cloves");
  assert.equal(cleanIngredientForGrocery("lemon (juiced)"), "lemon");
  assert.equal(cleanIngredientForGrocery("lemon (cut into wedges/sliced for serving)"), "lemon");
  assert.equal(cleanIngredientForGrocery("medium-large russet potato (peeled and chopped )"), "russet potato");
  assert.deepEqual(groceryRowParts("1 tsp **crushed red pepper**"), {
    name: "crushed red pepper",
    quantityLabel: "1 tsp",
  });
  assert.deepEqual(groceryRowParts("garlic cloves (roughly chopped)"), {
    name: "garlic cloves",
    quantityLabel: "",
  });
  assert.deepEqual(groceryRowParts("1 tsp freshly ground black pepper"), {
    name: "black pepper",
    quantityLabel: "1 tsp",
  });
  assert.deepEqual(groceryRowParts("Para ~4–6 filetes:"), {
    name: "",
    quantityLabel: "",
  });
});

test("shopping rows collapse shared meal provenance to a count", () => {
  const state = groceryMealRowState([
    { dateKey: "2026-09-03", mealSlot: "lunch", recipeName: { en: "Yogurt Marinated Grilled Chicken Skewers" }, servings: 3, batches: 0.5 },
    { dateKey: "2026-09-08", mealSlot: "dinner", recipeName: { en: "Yogurt Marinated Grilled Chicken Skewers" }, servings: 4, batches: 1 },
  ]);
  assert.equal(state.count, 2);
  assert.equal(state.collapsed, true);
  assert.equal(formatCompactGroceryMealCue({ dateLabel: "Thu, Sep 3", mealLabel: "Lunch" }), "Thu, Sep 3 · Lunch");
  assert.equal(formatCompactGroceryMealCue({ dateLabel: "jue, 3 de sept", mealLabel: "Almuerzo" }), "jue, 3 de sept · Almuerzo");
});
