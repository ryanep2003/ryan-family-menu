import test from "node:test";
import assert from "node:assert/strict";

import {
  groceryItem,
  groceryItemsFromRecipe,
  inventoryMatchFor,
  mergeGroceries,
} from "../grocery-logic.js";

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

test("groceryItemsFromRecipe tags items already at home and keeps recipe context", () => {
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
  assert.equal(items[0].inInventory, true);
  assert.equal(items[0].checked, true);
  assert.deepEqual(items[0].text, { en: "4 lemons", es: "4 limones" });
  assert.equal(items[1].inInventory, false);
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

test("groceryItem records optional household attribution", () => {
  const item = groceryItem("Milk", { updatedBy: "Eric" });

  assert.equal(item.updatedBy, "Eric");
  assert.ok(item.updatedAt);
});
