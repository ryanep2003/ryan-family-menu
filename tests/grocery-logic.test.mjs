import test from "node:test";
import assert from "node:assert/strict";

import {
  groceryItem,
  groceryItemsFromRecipe,
  inventoryMatchFor,
  mergeGroceries,
  normalizedWords,
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

test("inventory and grocery matching stay reliable for accented Spanish ingredients", () => {
  const inventory = [
    { text: { es: "limón" }, stockState: "full" },
    { text: { es: "jalapeño" }, stockState: "full" },
    { text: { es: "piña" }, stockState: "full" },
  ];

  assert.deepEqual(inventoryMatchFor(inventory, { es: "4 limones" }), inventory[0]);
  assert.deepEqual(inventoryMatchFor(inventory, { es: "1 jalapeño" }), inventory[1]);
  assert.deepEqual(inventoryMatchFor(inventory, { es: "piña" }), inventory[2]);
});

test("groceryItemsFromRecipe respects accented Spanish pantry matches", () => {
  const recipe = {
    id: "salsa",
    name: { en: "Salsa", es: "Salsa" },
    ingredients: {
      en: ["2 jalapenos", "1 pineapple"],
      es: ["2 jalapeños", "1 piña"],
    },
  };
  const inventory = [{ text: { es: "jalapeño" }, stockState: "full" }];

  const items = groceryItemsFromRecipe(recipe, "es", inventory);

  assert.equal(items[0].inInventory, true);
  assert.equal(items[0].checked, true);
  assert.equal(items[1].inInventory, false);
});

test("normalizedWords keeps accented Spanish ingredients searchable", () => {
  assert.deepEqual(normalizedWords({ es: "1 jalapeño" }), ["jalapeno"]);
  assert.deepEqual(normalizedWords({ es: "piña" }), ["pina"]);
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

test("groceryItem records optional household attribution", () => {
  const item = groceryItem("Milk", { updatedBy: "Eric" });

  assert.equal(item.updatedBy, "Eric");
  assert.ok(item.updatedAt);
});
