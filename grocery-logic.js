import {
  allLocalizedText,
  canonicalText,
  localizedTextMap,
  updateLocalizedText,
} from "./localized-data.js";

export function cleanIngredientForGrocery(item) {
  return `${item || ""}`.replace(/\s+/g, " ").trim();
}

export function normalizedWords(value) {
  const stopWords = new Set([
    "cup", "cups", "tbsp", "tablespoon", "tablespoons", "tsp", "teaspoon", "teaspoons",
    "lb", "lbs", "pound", "pounds", "oz", "ounce", "ounces", "gram", "grams", "g",
    "large", "small", "medium", "fresh", "freshly", "chopped", "diced", "sliced",
    "minced", "grated", "ground", "kosher", "taste", "optional", "plus", "more",
    "for", "and", "with", "the", "of", "or", "to", "in",
  ]);

  return allLocalizedText(value)
    .flatMap((entry) => `${entry || ""}`
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/))
    .map((word) => word.replace(/s$/, ""))
    .filter((word) => word.length > 2 && !stopWords.has(word) && !/^\d+$/.test(word));
}

export function inventoryMatchFor(inventory, text, includeDepleted = false) {
  const ingredientWords = normalizedWords(text);
  if (!ingredientWords.length) return null;

  return inventory.find((item) => {
    if (!includeDepleted && ["low", "out"].includes(item.stockState)) return false;
    const itemWords = normalizedWords(item.text);
    if (!itemWords.length) return false;
    return itemWords.every((word) => ingredientWords.includes(word));
  }) || null;
}

function itemKey(item) {
  return `${item.store || "any"}::${canonicalText(item.text).toLowerCase()}`;
}

function normalizeMealUses(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((use) => use && typeof use === "object")
    .map((use) => ({
      dateKey: /^\d{4}-\d{2}-\d{2}$/.test(use.dateKey) ? use.dateKey : "",
      mealSlot: ["breakfast", "lunch", "dinner"].includes(use.mealSlot) ? use.mealSlot : "",
      recipeId: `${use.recipeId || ""}`.trim().slice(0, 160),
      recipeName: use.recipeName,
    }))
    .filter((use) => use.dateKey && use.mealSlot && (use.recipeId || use.recipeName));
}

function mealUseKey(use) {
  return `${use.dateKey}::${use.mealSlot}::${use.recipeId || canonicalText(use.recipeName).toLowerCase()}`;
}

export function mergeMealUses(existing = [], incoming = []) {
  const byKey = new Map();
  [...normalizeMealUses(existing), ...normalizeMealUses(incoming)].forEach((use) => {
    byKey.set(mealUseKey(use), use);
  });
  return [...byKey.values()].slice(0, 12);
}

export function groceryItem(text, {
  store = "any",
  source = "manual",
  recipeId = "",
  recipeName = "",
  inventoryItem = null,
  lang = "en",
  updatedBy = "",
  mealUses = [],
} = {}) {
  const timestamp = new Date().toISOString();
  return {
    id: `grocery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: typeof text === "string"
      ? updateLocalizedText("", cleanIngredientForGrocery(text), lang)
      : text,
    checked: Boolean(inventoryItem),
    store,
    source,
    recipeId,
    recipeName: typeof recipeName === "string" ? localizedTextMap(recipeName) : recipeName,
    inInventory: Boolean(inventoryItem),
    createdAt: timestamp,
    updatedAt: timestamp,
    mealUses: mergeMealUses(mealUses),
    ...(updatedBy ? { updatedBy } : {}),
  };
}

export function mergeGroceries(existing, incoming) {
  const byKey = new Map(existing.map((item) => [itemKey(item), item]));
  incoming.forEach((item) => {
    const key = itemKey(item);
    if (!byKey.has(key)) {
      byKey.set(itemKey(item), item);
      return;
    }
    const existingItem = byKey.get(key);
    const mealUses = mergeMealUses(existingItem.mealUses, item.mealUses);
    if (mealUses.length) byKey.set(key, { ...existingItem, mealUses });
  });
  return [...byKey.values()];
}

export function groceryItemsFromRecipe(recipe, lang, inventory, updatedBy = "", mealUse = null) {
  const ingredientsEn = recipe.ingredients?.en || [];
  const ingredientsEs = recipe.ingredients?.es || [];
  const ingredientCount = Math.max(ingredientsEn.length, ingredientsEs.length);

  return Array.from({ length: ingredientCount }, (_, index) => {
    const text = {};
    const en = cleanIngredientForGrocery(ingredientsEn[index]);
    const es = cleanIngredientForGrocery(ingredientsEs[index]);
    if (en) text.en = en;
    if (es) text.es = es;
    if (!en && !es) return null;
    return groceryItem(text, {
      source: "recipe-detail",
      recipeId: recipe.id,
      recipeName: recipe.name,
      inventoryItem: inventoryMatchFor(inventory, text),
      lang,
      updatedBy,
      mealUses: mealUse ? [mealUse] : [],
    });
  }).filter(Boolean);
}
