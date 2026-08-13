import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { translations } from "../translations.js";

test("Week editor literal translation calls exist in both languages", async () => {
  const source = await readFile(new URL("../schedule-ui.js", import.meta.url), "utf8");
  const keys = [...source.matchAll(/\bt\("([^\"]+)"\)/g)].map((match) => match[1]);

  for (const key of new Set(keys)) {
    assert.ok(translations.en[key], `English translation missing for ${key}`);
    assert.ok(translations.es[key], `Spanish translation missing for ${key}`);
  }
});

test("shared state sanitizer accepts localized task and note fields", async () => {
  const source = await readFile(new URL("../netlify/functions/family-state.js", import.meta.url), "utf8");

  assert.match(source, /import \{ cleanLocalizedText, hasLocalizedContent \} from "\.\.\/\.\.\/localized-data\.js"/);
  assert.match(source, /notes: cleanLocalizedText\(source\.notes, 500\)/);
  assert.match(source, /const text = cleanLocalizedText\(task\?\.text, 220\)/);
  assert.match(source, /ingredientsText: cleanLocalizedText\(edit\.ingredientsText, 12000\)/);
  assert.match(source, /cardPhoto: cleanPhoto\(edit\.cardPhoto\)/);
  assert.match(source, /LEFTOVER_SERVINGS = \["one", "two", "threePlus"\]/);
  assert.match(source, /leftoverUseFirst: LEFTOVER_USE_FIRST\.includes\(handoff\.leftoverUseFirst\)/);
  assert.match(source, /snackStatus: SNACK_STATUS\.includes\(handoff\.snackStatus\)/);
  assert.match(source, /snack: cleanLocalizedText\(handoff\.snack, 120\)/);
  assert.match(source, /AVAILABLE_FOOD_TYPES = \["snack", "leftover"\]/);
  assert.match(source, /AVAILABLE_FOOD_USE_FOR = \["lunch", "snack", "nextDinner", "any"\]/);
  assert.match(source, /availableFood: cleanAvailableFood\(value\?\.availableFood\)/);
  assert.match(source, /const dinner = cleanText\(source\.dinner \|\| source\.main, 120\)/);
  assert.match(source, /breakfast: cleanText\(source\.breakfast, 120\)/);
  assert.match(source, /lunch: cleanText\(source\.lunch, 120\)/);
  assert.match(source, /lunchSalad: cleanText\(source\.lunchSalad, 120\)/);
});

test("grocery and inventory write endpoints sanitize localized fields", async () => {
  const groceries = await readFile(new URL("../netlify/functions/groceries.js", import.meta.url), "utf8");
  const inventory = await readFile(new URL("../netlify/functions/inventory.js", import.meta.url), "utf8");

  assert.match(groceries, /const text = cleanLocalizedText\(item\.text, 220\)/);
  assert.match(groceries, /recipeName: cleanLocalizedText\(item\.recipeName, 160\)/);
  assert.match(groceries, /updatedBy: cleanHouseholdMember\(item\.updatedBy\)/);
  assert.match(groceries, /mealUses: Array\.isArray\(item\.mealUses\)/);
  assert.match(inventory, /const text = cleanLocalizedText\(item\.text, 220\)/);
  assert.match(inventory, /quantity: cleanLocalizedText\(item\.quantity, 80\)/);
  assert.match(inventory, /updatedBy: cleanHouseholdMember\(item\.updatedBy\)/);
});

test("recipe writes and AI scan endpoints carry language-aware content", async () => {
  const familyState = await readFile(new URL("../netlify/functions/family-state.js", import.meta.url), "utf8");
  const recipes = await readFile(new URL("../netlify/functions/recipes.js", import.meta.url), "utf8");
  const inventoryScan = await readFile(new URL("../netlify/functions/recognize-inventory.js", import.meta.url), "utf8");
  const receiptScan = await readFile(new URL("../netlify/functions/recognize-receipt.js", import.meta.url), "utf8");
  const translateRecipe = await readFile(new URL("../netlify/functions/translate-recipe.js", import.meta.url), "utf8");
  const app = await readFile(new URL("../app.js", import.meta.url), "utf8");

  assert.match(recipes, /const name = cleanLocalizedText\(input\.name, 120\)/);
  assert.match(recipes, /if \(!hasLocalizedContent\(name\) \|\| !hasLocalizedContent\(ingredientsText\) \|\| !hasLocalizedContent\(stepsText\)\)/);
  assert.match(recipes, /const ingredientsText = cleanLocalizedText\(input\.ingredientsText, MAX_TEXT_LENGTH\)/);
  assert.match(recipes, /ingredientsText,\s*stepsText,/);
  assert.match(recipes, /\["main", "side", "salad", "sauce", "dessert"\]\.includes\(input\.category\)/);
  assert.match(familyState, /\["main", "side", "salad", "sauce", "dessert", "draft"\]\.includes\(edit\.category\)/);
  assert.match(inventoryScan, /const outputLanguage = cleanLanguage\(payload\.lang\)/);
  assert.match(receiptScan, /const outputLanguage = cleanLanguage\(payload\.lang\)/);
  assert.match(translateRecipe, /Translate this family recipe from/);
  assert.match(app, /"\/\.netlify\/functions\/translate-recipe"/);
  assert.match(app, /queueRecipeBackfillForCurrentLanguage\(\)/);
});
