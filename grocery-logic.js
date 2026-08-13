import {
  allLocalizedText,
  canonicalText,
  localizedTextMap,
  updateLocalizedText,
} from "./localized-data.js";

export function cleanIngredientForGrocery(item) {
  return `${item || ""}`.replace(/\s+/g, " ").trim();
}

function fractionValue(value) {
  const [numerator, denominator] = `${value}`.split("/").map(Number);
  return denominator ? numerator / denominator : 0;
}

export function parseIngredientAmount(value) {
  const text = cleanIngredientForGrocery(value);
  const match = text.match(/^(?:(\d+)\s+)?(\d+\/\d+|\d+(?:\.\d+)?)\s+(.+)$/);
  if (!match) return { quantity: 0, remainder: text };
  const whole = Number(match[1] || 0);
  const amount = match[2].includes("/") ? fractionValue(match[2]) : Number(match[2]);
  return { quantity: whole + amount, remainder: match[3] };
}

function formatIngredientAmount(value) {
  const rounded = Math.round(Number(value) * 100) / 100;
  const whole = Math.floor(rounded);
  const fraction = Math.round((rounded - whole) * 100) / 100;
  const fractionLabel = new Map([[0.25, "1/4"], [0.33, "1/3"], [0.5, "1/2"], [0.67, "2/3"], [0.75, "3/4"]]).get(fraction);
  if (fractionLabel) return whole ? `${whole} ${fractionLabel}` : fractionLabel;
  return `${rounded}`;
}

export function scaleIngredientText(value, scale = 1) {
  const parsed = parseIngredientAmount(value);
  if (!(parsed.quantity > 0) || !(Number(scale) > 0)) return parsed.remainder || cleanIngredientForGrocery(value);
  return `${formatIngredientAmount(parsed.quantity * Number(scale))} ${parsed.remainder}`;
}

function normalizedUnit(value) {
  const unit = `${value || ""}`.trim().toLowerCase().replace(/\.$/, "");
  const aliases = {
    cups: "cup", taza: "cup", tazas: "cup",
    tablespoon: "tbsp", tablespoons: "tbsp", cucharada: "tbsp", cucharadas: "tbsp",
    teaspoon: "tsp", teaspoons: "tsp", cucharadita: "tsp", cucharaditas: "tsp",
    lbs: "lb", pound: "lb", pounds: "lb", libra: "lb", libras: "lb",
    ounce: "oz", ounces: "oz", onza: "oz", onzas: "oz",
    grams: "g", gramo: "g", gramos: "g",
    kilogram: "kg", kilograms: "kg", kilogramo: "kg", kilogramos: "kg",
    packages: "package", paquete: "package", paquetes: "package",
    containers: "container", envase: "container", envases: "container",
  };
  return aliases[unit] || (["cup", "tbsp", "tsp", "lb", "oz", "g", "kg", "package", "container", "each"].includes(unit) ? unit : "each");
}

function ingredientUnit(value) {
  return normalizedUnit(cleanIngredientForGrocery(value).split(" ")[0]);
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
  const ingredientKey = item.ingredientKey || normalizedWords(item.text).join("-") || canonicalText(item.text).toLowerCase();
  return `${item.store || "any"}::${ingredientKey}`;
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
      ...(Number(use.batches) > 0 ? { batches: Number(use.batches) } : {}),
      ...(Number(use.servings) > 0 ? { servings: Number(use.servings) } : {}),
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
  ingredientKey = "",
  plannedQuantities = {},
  ingredientRemainders = {},
  plannedUnits = {},
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
    ...(ingredientKey ? { ingredientKey } : {}),
    ...(Object.keys(plannedQuantities).length ? { plannedQuantities } : {}),
    ...(Object.keys(ingredientRemainders).length ? { ingredientRemainders } : {}),
    ...(Object.keys(plannedUnits).length ? { plannedUnits } : {}),
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
    const existingUses = normalizeMealUses(existingItem.mealUses);
    const existingUseKeys = new Set(existingUses.map(mealUseKey));
    const incomingUses = normalizeMealUses(item.mealUses);
    const newUses = incomingUses.filter((use) => !existingUseKeys.has(mealUseKey(use)));
    const mealUses = mergeMealUses(existingItem.mealUses, item.mealUses);
    const existingHasPlan = Object.keys(existingItem.plannedQuantities || {}).length > 0;
    const incomingHasPlan = Object.keys(item.plannedQuantities || {}).length > 0;
    if (!existingHasPlan && incomingHasPlan) {
      byKey.set(key, {
        ...existingItem,
        text: item.text,
        ingredientKey: item.ingredientKey,
        plannedQuantities: item.plannedQuantities,
        ingredientRemainders: item.ingredientRemainders,
        plannedUnits: item.plannedUnits,
        inInventory: existingItem.inInventory || item.inInventory,
        checked: existingItem.checked || item.checked,
        mealUses,
      });
      return;
    }
    const plannedQuantities = { ...(existingItem.plannedQuantities || {}) };
    const text = { ...(typeof existingItem.text === "object" ? existingItem.text : localizedTextMap(existingItem.text)) };
    for (const lang of newUses.length ? ["en", "es"] : []) {
      const existingQuantity = Number(existingItem.plannedQuantities?.[lang] || 0);
      const incomingQuantity = Number(item.plannedQuantities?.[lang] || 0);
      const existingRemainder = existingItem.ingredientRemainders?.[lang] || "";
      const incomingRemainder = item.ingredientRemainders?.[lang] || "";
      if (existingQuantity > 0 && incomingQuantity > 0 && canonicalText(existingRemainder) === canonicalText(incomingRemainder)) {
        plannedQuantities[lang] = existingQuantity + incomingQuantity;
        text[lang] = `${formatIngredientAmount(plannedQuantities[lang])} ${existingRemainder}`;
      }
    }
    byKey.set(key, { ...existingItem, text, plannedQuantities, mealUses });
  });
  return [...byKey.values()];
}

export function replacePlannedGroceries(existing, generated) {
  const retained = existing.filter((item) => !["meal-plan", "week-plan"].includes(item.source));
  return [...retained, ...mergeGroceries([], generated)];
}

export function applyInventoryCoverage(items, inventory) {
  return items.map((item) => {
    if (!Object.keys(item.plannedQuantities || {}).length) return item;
    const inventoryItem = inventoryMatchFor(inventory, item.ingredientRemainders || item.text);
    if (!inventoryItem) return { ...item, inInventory: false };
    const remainingQuantities = {};
    const text = { ...(typeof item.text === "object" ? item.text : localizedTextMap(item.text)) };
    for (const lang of ["en", "es"]) {
      const needed = Number(item.plannedQuantities?.[lang] || 0);
      if (!(needed > 0)) continue;
      const compatible = normalizedUnit(item.plannedUnits?.[lang]) === normalizedUnit(inventoryItem.unit || "each");
      const remaining = compatible ? Math.max(0, needed - (Number(inventoryItem.amount) || 0)) : needed;
      remainingQuantities[lang] = remaining;
      if (remaining > 0 && item.ingredientRemainders?.[lang]) {
        text[lang] = `${formatIngredientAmount(remaining)} ${item.ingredientRemainders[lang]}`;
      }
    }
    const covered = Object.values(remainingQuantities).length > 0
      && Object.values(remainingQuantities).every((amount) => amount <= 0);
    return {
      ...item,
      text,
      remainingQuantities,
      inInventory: true,
      checked: covered || item.checked,
    };
  });
}

export function groceryItemsFromRecipe(recipe, lang, inventory, updatedBy = "", mealUse = null, scale = 1) {
  const ingredientsEn = recipe.ingredients?.en || [];
  const ingredientsEs = recipe.ingredients?.es || [];
  const ingredientCount = Math.max(ingredientsEn.length, ingredientsEs.length);

  return Array.from({ length: ingredientCount }, (_, index) => {
    const text = {};
    const rawEn = cleanIngredientForGrocery(ingredientsEn[index]);
    const rawEs = cleanIngredientForGrocery(ingredientsEs[index]);
    const en = scaleIngredientText(rawEn, scale);
    const es = scaleIngredientText(rawEs, scale);
    if (en) text.en = en;
    if (es) text.es = es;
    if (!en && !es) return null;
    const parsedEn = parseIngredientAmount(rawEn);
    const parsedEs = parseIngredientAmount(rawEs);
    const ingredientKey = normalizedWords(parsedEn.remainder || parsedEs.remainder).join("-");
    return groceryItem(text, {
      source: "recipe-detail",
      recipeId: recipe.id,
      recipeName: recipe.name,
      inventoryItem: inventoryMatchFor(inventory, text),
      lang,
      updatedBy,
      mealUses: mealUse ? [mealUse] : [],
      ingredientKey,
      plannedQuantities: {
        ...(parsedEn.quantity ? { en: parsedEn.quantity * scale } : {}),
        ...(parsedEs.quantity ? { es: parsedEs.quantity * scale } : {}),
      },
      ingredientRemainders: {
        ...(parsedEn.remainder ? { en: parsedEn.remainder } : {}),
        ...(parsedEs.remainder ? { es: parsedEs.remainder } : {}),
      },
      plannedUnits: {
        ...(parsedEn.quantity ? { en: ingredientUnit(parsedEn.remainder) } : {}),
        ...(parsedEs.quantity ? { es: ingredientUnit(parsedEs.remainder) } : {}),
      },
    });
  }).filter(Boolean);
}
