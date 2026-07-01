import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shared state sanitizer accepts localized task and note fields", async () => {
  const source = await readFile(new URL("../netlify/functions/family-state.js", import.meta.url), "utf8");

  assert.match(source, /import \{ cleanLocalizedText, hasLocalizedContent \} from "\.\.\/\.\.\/localized-data\.js"/);
  assert.match(source, /notes: cleanLocalizedText\(source\.notes, 500\)/);
  assert.match(source, /const text = cleanLocalizedText\(task\?\.text, 220\)/);
  assert.match(source, /ingredientsText: cleanLocalizedText\(edit\.ingredientsText, 12000\)/);
});

test("grocery and inventory write endpoints sanitize localized fields", async () => {
  const groceries = await readFile(new URL("../netlify/functions/groceries.js", import.meta.url), "utf8");
  const inventory = await readFile(new URL("../netlify/functions/inventory.js", import.meta.url), "utf8");

  assert.match(groceries, /const text = cleanLocalizedText\(item\.text, 220\)/);
  assert.match(groceries, /recipeName: cleanLocalizedText\(item\.recipeName, 160\)/);
  assert.match(inventory, /const text = cleanLocalizedText\(item\.text, 220\)/);
  assert.match(inventory, /quantity: cleanLocalizedText\(item\.quantity, 80\)/);
});

test("recipe writes and AI scan endpoints carry language-aware content", async () => {
  const recipes = await readFile(new URL("../netlify/functions/recipes.js", import.meta.url), "utf8");
  const inventoryScan = await readFile(new URL("../netlify/functions/recognize-inventory.js", import.meta.url), "utf8");
  const receiptScan = await readFile(new URL("../netlify/functions/recognize-receipt.js", import.meta.url), "utf8");

  assert.match(recipes, /const name = cleanLocalizedText\(input\.name, 120\)/);
  assert.match(recipes, /ingredientsText: cleanLocalizedText\(input\.ingredientsText, MAX_TEXT_LENGTH\)/);
  assert.match(inventoryScan, /const outputLanguage = cleanLanguage\(payload\.lang\)/);
  assert.match(receiptScan, /const outputLanguage = cleanLanguage\(payload\.lang\)/);
});
