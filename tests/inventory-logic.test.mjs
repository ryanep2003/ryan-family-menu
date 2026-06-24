import test from "node:test";
import assert from "node:assert/strict";
import { inventoryItem, mergeInventory } from "../inventory-logic.js";

test("inventoryItem cleans text and defaults stock metadata", () => {
  const item = inventoryItem("  2 lemons  ", "  several  ", "fridge");

  assert.match(item.id, /^inventory-/);
  assert.equal(item.text, "2 lemons");
  assert.equal(item.quantity, "several");
  assert.equal(item.location, "fridge");
  assert.equal(item.stockState, "some");
  assert.ok(item.createdAt);
});

test("mergeInventory updates matching location and text without duplicating", () => {
  const existing = [{
    id: "old",
    text: "Milk",
    quantity: "half gallon",
    location: "fridge",
    stockState: "low",
  }];
  const incoming = [{
    id: "new",
    text: "milk",
    quantity: "1 gallon",
    location: "fridge",
    stockState: "full",
  }];

  const merged = mergeInventory(existing, incoming);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "old");
  assert.equal(merged[0].quantity, "1 gallon");
  assert.equal(merged[0].stockState, "full");
  assert.ok(merged[0].updatedAt);
});

test("mergeInventory keeps same item names separate by location", () => {
  const merged = mergeInventory(
    [{ id: "pantry", text: "Rice", location: "pantry" }],
    [{ id: "freezer", text: "Rice", location: "freezer" }]
  );

  assert.equal(merged.length, 2);
});
