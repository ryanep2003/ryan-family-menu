import assert from "node:assert/strict";
import test from "node:test";

import { normalizeShoppingList, normalizeShoppingLists, shoppingListScopeLabelKey } from "../shopping-list-logic.js";

test("saved shopping lists keep bounded reusable scope definitions", () => {
  const list = normalizeShoppingList({
    id: "weekend",
    name: "  Saturday  ",
    scope: "two-days",
    dateKey: "2026-08-29",
    items: Array.from({ length: 600 }, (_, index) => ({ id: `${index}` })),
  });

  assert.equal(list.name, "Saturday");
  assert.equal(list.scope, "two-days");
  assert.equal(list.dateKey, "2026-08-29");
  assert.equal(list.items.length, 300);
  assert.equal(shoppingListScopeLabelKey(list), "shoppingListTwoDays");
});

test("saved shopping lists discard duplicate ids and unsupported scopes safely", () => {
  const lists = normalizeShoppingLists([
    { id: "one", name: "One", scope: "recipe", recipeId: "lemon-chicken", items: [] },
    { id: "one", name: "Duplicate", scope: "unknown", items: [] },
    { id: "two", name: "Two", scope: "snapshot", items: [] },
  ]);

  assert.deepEqual(lists.map((list) => list.id), ["one", "two"]);
  assert.equal(lists[1].scope, "snapshot");
});
