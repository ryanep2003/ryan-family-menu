import test from "node:test";
import assert from "node:assert/strict";
import { groceryItem, groceryItemsFromRecipe } from "../grocery-logic.js";
import { commitWeekShoppingPreview } from "../week-shopping-client.js";

const recipe = (id, ingredient) => ({ id, name: { en: id }, ingredients: { en: [ingredient] } });
const planned = (food, dateKey, scale = 1) => {
  const [item] = groceryItemsFromRecipe(food, "en", [], "Family", {
    dateKey, mealSlot: "dinner", recipeId: food.id, recipeName: food.name,
  }, scale);
  return { ...item, source: "meal-plan" };
};
const basePreview = (generatedItems) => ({ scheduleVersion: 8, groceryVersion: 4, generatedItems, inventorySnapshot: [] });

test("explicit shopping update preserves manual rows and stable checked IDs", async () => {
  const rice = planned(recipe("rice", "1 cup rice"), "2026-09-21");
  rice.checked = true;
  const manual = groceryItem("Milk", { source: "manual" });
  const beans = planned(recipe("beans", "1 can beans"), "2026-09-22");
  let submitted;
  const result = await commitWeekShoppingPreview({
    preview: basePreview([rice, beans]),
    getLatestSchedule: async () => ({ version: 8 }),
    getLatestGroceries: async () => ({ items: [manual, rice], version: 4 }),
    putGroceries: async (record) => { submitted = record; return { ...record, version: 5 }; },
  });

  assert.equal(result.status, "saved");
  assert.equal(submitted.version, 4);
  assert.equal(submitted.items.length, 3);
  assert.ok(submitted.items.some((item) => item.id === manual.id));
  assert.ok(submitted.items.some((item) => item.id === rice.id && item.checked));
  assert.ok(submitted.items.some((item) => item.ingredientKey === beans.ingredientKey && !item.checked));
});

test("checked quantity increases and removed purchases block the grocery write", async () => {
  const rice = planned(recipe("rice", "1 cup rice"), "2026-09-21");
  rice.checked = true;
  let writes = 0;
  for (const generatedItems of [
    [planned(recipe("rice", "1 cup rice"), "2026-09-21", 2)],
    [],
  ]) {
    const result = await commitWeekShoppingPreview({
      preview: basePreview(generatedItems),
      getLatestSchedule: async () => ({ version: 8 }),
      getLatestGroceries: async () => ({ items: [rice], version: 4 }),
      putGroceries: async () => { writes += 1; },
    });
    assert.equal(result.status, "review-required");
  }
  assert.equal(writes, 0);
});

test("stale schedule or groceries require a new preview without writing", async () => {
  let writes = 0;
  for (const [scheduleVersion, groceryVersion] of [[9, 4], [8, 5]]) {
    const result = await commitWeekShoppingPreview({
      preview: basePreview([planned(recipe("rice", "1 cup rice"), "2026-09-21")]),
      getLatestSchedule: async () => ({ version: scheduleVersion }),
      getLatestGroceries: async () => ({ items: [], version: groceryVersion }),
      putGroceries: async () => { writes += 1; },
    });
    assert.equal(result.status, "stale");
  }
  assert.equal(writes, 0);
});

test("an unchanged second approval performs no duplicate write", async () => {
  const rice = planned(recipe("rice", "1 cup rice"), "2026-09-21");
  let writes = 0;
  const result = await commitWeekShoppingPreview({
    preview: basePreview([rice]),
    getLatestSchedule: async () => ({ version: 8 }),
    getLatestGroceries: async () => ({ items: [rice], version: 4 }),
    putGroceries: async () => { writes += 1; },
  });
  assert.equal(result.status, "no-change");
  assert.equal(writes, 0);
});

test("a grocery version conflict stops after one write attempt", async () => {
  let writes = 0;
  const result = await commitWeekShoppingPreview({
    preview: basePreview([planned(recipe("rice", "1 cup rice"), "2026-09-21")]),
    getLatestSchedule: async () => ({ version: 8 }),
    getLatestGroceries: async () => ({ items: [], version: 4 }),
    putGroceries: async () => { writes += 1; throw { status: 409 }; },
  });
  assert.equal(result.status, "conflict");
  assert.equal(writes, 1);
});
