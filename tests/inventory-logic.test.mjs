import test from "node:test";
import assert from "node:assert/strict";
import { inventoryItem, mergeInventory } from "../inventory-logic.js";

test("inventoryItem cleans text and defaults stock metadata", () => {
  const item = inventoryItem("  2 lemons  ", "  several  ", "fridge");

  assert.match(item.id, /^inventory-/);
  assert.deepEqual(item.text, { en: "2 lemons" });
  assert.deepEqual(item.quantity, { en: "several" });
  assert.equal(item.location, "fridge");
  assert.equal(item.stockState, "some");
  assert.ok(item.createdAt);
});

test("mergeInventory updates matching location and text without duplicating", () => {
  const existing = [{
    ...inventoryItem("Milk", "half gallon", "fridge"),
    id: "old",
    stockState: "low",
  }];
  const incoming = [{
    ...inventoryItem("milk", "1 gallon", "fridge"),
    id: "new",
    stockState: "full",
  }];

  const merged = mergeInventory(existing, incoming);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "old");
  assert.equal(merged[0].quantity.en, "1 gallon");
  assert.equal(merged[0].stockState, "full");
  assert.ok(merged[0].updatedAt);
});

test("mergeInventory keeps same item names separate by location", () => {
  const merged = mergeInventory(
    [{ ...inventoryItem("Rice", "", "pantry"), id: "pantry" }],
    [{ ...inventoryItem("Rice", "", "freezer"), id: "freezer" }]
  );

  assert.equal(merged.length, 2);
});
