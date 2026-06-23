function localizeRecipeField(value, lang) {
  if (typeof value === "string") return value;
  return value?.[lang] || value?.en || "";
}

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

  return `${value || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
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
  return `${item.store || "any"}::${item.text.toLowerCase()}`;
}

export function groceryItem(text, {
  store = "any",
  source = "manual",
  recipeName = "",
  inventoryItem = null,
} = {}) {
  return {
    id: `grocery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: cleanIngredientForGrocery(text),
    checked: Boolean(inventoryItem),
    store,
    source,
    recipeName,
    inInventory: Boolean(inventoryItem),
    createdAt: new Date().toISOString(),
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

export function groceryItemsFromRecipe(recipe, lang, inventory) {
  const recipeName = localizeRecipeField(recipe.name, lang);
  const ingredients = recipe.ingredients?.[lang] || recipe.ingredients?.en || [];

  return ingredients
    .map((ingredient) => cleanIngredientForGrocery(ingredient))
    .filter(Boolean)
    .map((text) => groceryItem(text, {
      source: "recipe-detail",
      recipeName,
      inventoryItem: inventoryMatchFor(inventory, text),
    }));
}
