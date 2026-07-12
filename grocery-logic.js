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

export function groceryItem(text, {
  store = "any",
  source = "manual",
  recipeId = "",
  recipeName = "",
  inventoryItem = null,
  lang = "en",
  updatedBy = "",
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
    ...(updatedBy ? { updatedBy } : {}),
  };
}

export function mergeGroceries(existing, incoming) {
  const byKey = new Map(existing.map((item) => [itemKey(item), item]));
  incoming.forEach((item) => {
    if (!byKey.has(itemKey(item))) {
      byKey.set(itemKey(item), item);
    }
  });
  return [...byKey.values()];
}

export function groceryItemsFromRecipe(recipe, lang, inventory, updatedBy = "") {
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
    });
  }).filter(Boolean);
}
