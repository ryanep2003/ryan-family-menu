import {
  allLocalizedText,
  canonicalText,
  localizedTextMap,
  updateLocalizedText,
} from "./localized-data.js";

const GROCERY_AISLE_ORDER = ["produce", "dairy", "meat", "bakery", "frozen", "pantry"];

const GROCERY_AISLE_PATTERNS = {
  produce: /\b(lemon|lime|spinach|lettuce|tomato|onion|garlic|apple|banana|berr|avocado|carrot|cucumber|pepper|cilantro|parsley|herb|potato|onion|fruit|vegetable|produce|celery|kale|broccoli|cabbage|zucchini|mango|grape|orange|strawberry|blueberry|lim[oó]n|espinaca|lechuga|tomate|cebolla|ajo|manzana|pl[aá]tano|aguacate|zanahoria|pepino|pimiento|cilantro|papa|patata|verdura|fruta|apio|br[oó]coli)\b/i,
  dairy: /\b(milk|cheese|yogurt|yoghurt|butter|cream|egg|leche|queso|yogur|mantequilla|crema|huevo|cheddar|mozzarella|parmesan|parmesano)\b/i,
  meat: /\b(chicken|beef|pork|turkey|fish|salmon|shrimp|bacon|sausage|pollo|res|cerdo|carne|pavo|pescado|camar[oó]n|tocino|salchicha)\b/i,
  bakery: /\b(bread|tortilla|bun|roll|bagel|pita|croissant|pan|bollo)\b/i,
  frozen: /\b(frozen|congelad)\b/i,
};

const GROCERY_UNIT_WORDS = new Set([
  "cup", "cups", "taza", "tazas",
  "tbsp", "tablespoon", "tablespoons", "cucharada", "cucharadas",
  "tsp", "teaspoon", "teaspoons", "cucharadita", "cucharaditas",
  "lb", "lbs", "pound", "pounds", "libra", "libras",
  "oz", "ounce", "ounces", "onza", "onzas",
  "g", "gram", "grams", "gramo", "gramos",
  "kg", "kilogram", "kilograms", "kilogramo", "kilogramos",
  "package", "packages", "paquete", "paquetes",
  "container", "containers", "envase", "envases",
  "bunch", "bunches", "manojo", "manojos",
  "clove", "cloves", "diente", "dientes",
  "can", "cans", "lata", "latas",
  "bag", "bags", "bolsa", "bolsas",
  "gal", "gallon", "gallons", "galon", "galón", "galones",
]);

const INGREDIENT_SECTION_HEADER = /^(ingredients?|ingredientes?|directions?|instrucciones?|method|m[eé]todo|preparaci[oó]n|notes?|notas?|yield|rendimiento|serves?|servings?|porciones?)\s*:?\s*$/i;
const INGREDIENT_HEADER_PREFIX = /^(?:ingredients?|ingredientes?)\s*:\s*/i;
const SERVING_COUNT_HEADER = /^(?:para|for)\s*~?\s*\d/i;
const YIELD_HEADER = /^(?:makes?|rinde|yield(?:s)?|serves?|porciones?|enough for|para servir)\b/i;
const FOR_THE_HEADER = /^(?:for the|para (?:el|la|los|las|un|una))\b/i;
const INSTRUCTION_START = /^(?:combine|mix|coat|dip|stir|whisk|pour|place|heat|cook|bake|fry|simmer|bring|season|serve|toss|spread|drizzle|marinate|blend|beat|fold|transfer|remove|preheat|using|then|while|until|pat|press|dredge|bread|combina(?:r)?|mezcla(?:r)?|cubre|cubrir|reboza(?:r)?|bate|batir|a[nñ]ade|agrega(?:r)?|coloca(?:r)?|calienta(?:r)?|cocina(?:r)?|hornea(?:r)?|fr[ií]e|sazona(?:r)?|sirve|servir|esparce|marina(?:r)?|precalienta(?:r)?|reserva(?:r)?|retira(?:r)?|unta(?:r)?|moja(?:r)?|empana(?:r)?)\b/i;
const INSTRUCTION_SCENE = /^(?:in a |in the |en un |en una |en el |en la |with the |into |onto )/i;
const INSTRUCTION_FLOW = /\b(then|until|hasta(?:\s+que)?|combine|mix|coat|dip|stir|mezcla|reboza|cubre)\b/i;
const SIZE_PREFIX = /^(?:extra[-\s]?(?:large|small)|medium[-\s]large|very\s+large|large|small|medium|jumbo|big|grandes?|pequeñ[oa]s?|median[oa]s?)\s+/i;
const FRESH_PREFIX = /^(?:freshly\s+ground|freshly|fresh|roughly|recién\s+molid[oa]s?|frescos?|frescas?)\s+/i;
const TRAILING_PREP = /(?:,\s*)?(?:\s+(?:divided|plus more(?:\s+if needed)?|for serving|para servir|for garnish|or more as needed(?:\s+to coat)?|as needed(?:\s+to coat)?|cut into wedges(?:[\/,]?\s*sliced for serving)?|peeled and chopped|and chopped))\s*$/i;

function cleanIngredientLine(line) {
  return `${line || ""}`
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]+/g, "")
    .replace(/^\s*#+\s*/, "")
    .replace(/^\s*[-•●◦]+\s*/, "")
    .replace(INGREDIENT_HEADER_PREFIX, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isServingOrSectionHeader(line) {
  if (SERVING_COUNT_HEADER.test(line) || YIELD_HEADER.test(line) || FOR_THE_HEADER.test(line)) return true;
  if (/:$/.test(line) && !/^\d/.test(line) && line.split(/\s+/).length <= 10) return true;
  return false;
}

function isCookingInstructionLine(line) {
  if (/^\d+[\.)]\s+\S/.test(line)) return true;
  if (INSTRUCTION_START.test(line) || INSTRUCTION_SCENE.test(line)) return true;
  const words = line.split(/\s+/).filter(Boolean);
  return words.length >= 12 && INSTRUCTION_FLOW.test(line);
}

function isIngredientJunkLine(line) {
  if (!line) return true;
  if (INGREDIENT_SECTION_HEADER.test(line)) return true;
  if (isServingOrSectionHeader(line)) return true;
  if (isCookingInstructionLine(line)) return true;
  if (/^[-—–_=*:~]+$/.test(line)) return true;
  return false;
}

const LEADING_NAME_PREP = /^(?:de las|de los|de la|del|de|of)\s+/i;
const PACKING_FLUFF = /\s+(?:bien compactadas?|well packed|packed(?:\s+down)?)\b/gi;
const TRAILING_SIZE = /\s+(?:grandes?|pequeñ[oa]s?|chicos?|large|small)$/i;
const TRAILING_FRESH = /\s+(?:frescos?|frescas?|fresh)$/i;
const ADVICE_SPLIT = /\s*[—–]\s*|\s+-\s+|\s*;\s*/;

function truncateGroceryAdviceTail(value) {
  const text = `${value || ""}`.trim();
  const parts = text.split(ADVICE_SPLIT).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return text;
  return parts[0];
}

function shortenLongAisleName(value) {
  const text = `${value || ""}`.trim();
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 8 && text.length <= 50) return text;
  const cut = [];
  for (const word of words) {
    if (/^(?:y|e|o|u|con|para|and|or|with|for)$/i.test(word) && cut.length >= 2) break;
    cut.push(word);
    if (cut.length >= 4) break;
  }
  return cut.join(" ");
}

export function groceryNameDedupeKey(name) {
  return `${name || ""}`
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function collapseGroceryItemsByDisplayName(items, getName) {
  const groups = [];
  const indexByKey = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = groceryNameDedupeKey(getName(item));
    if (!key) return;
    if (!indexByKey.has(key)) {
      indexByKey.set(key, groups.length);
      groups.push({ item, ids: [item.id].filter(Boolean) });
      return;
    }
    const ids = groups[indexByKey.get(key)].ids;
    if (item.id && !ids.includes(item.id)) ids.push(item.id);
  });
  return groups;
}

export function stripGroceryPrepChrome(value) {
  let text = truncateGroceryAdviceTail(value);
  text = text.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s*[\(\)]\s*/g, " ");
  text = text.replace(/\s+/g, " ").trim().replace(/[.,;:*_`-]+$/g, "").trim();
  while (LEADING_NAME_PREP.test(text)) text = text.replace(LEADING_NAME_PREP, "");
  while (SIZE_PREFIX.test(text)) text = text.replace(SIZE_PREFIX, "");
  text = text.replace(FRESH_PREFIX, "");
  text = text.replace(PACKING_FLUFF, " ");
  text = text.replace(TRAILING_PREP, "").trim();
  const wordCount = () => text.split(/\s+/).filter(Boolean).length;
  if (wordCount() >= 2) text = text.replace(TRAILING_SIZE, "").trim();
  if (wordCount() >= 3) text = text.replace(TRAILING_FRESH, "").trim();
  text = text.replace(/\s+/g, " ").trim();
  return shortenLongAisleName(text);
}

export function cleanIngredientForGrocery(item) {
  const lines = `${item || ""}`
    .split(/\r?\n/)
    .map(cleanIngredientLine)
    .filter((line) => !isIngredientJunkLine(line))
    .map(stripGroceryPrepChrome)
    .filter(Boolean);
  if (!lines.length) return "";
  if (lines.length === 1) return lines[0];
  const withAmount = [...lines].reverse().find((line) => /^\d/.test(line));
  return withAmount || lines[lines.length - 1];
}

export function formatCompactGroceryMealCue({ dateLabel = "", mealLabel = "" } = {}) {
  return [dateLabel, mealLabel].filter(Boolean).join(" · ");
}

export function groceryMealRowState(uses) {
  const meals = Array.isArray(uses)
    ? uses.filter((use) => use
      && /^\d{4}-\d{2}-\d{2}$/.test(use.dateKey)
      && ["breakfast", "lunch", "dinner"].includes(use.mealSlot))
    : [];
  return {
    count: meals.length,
    uses: meals,
    collapsed: meals.length > 1,
  };
}

export function groceryAisleFor(text) {
  const haystack = canonicalText(text).toLowerCase();
  for (const key of GROCERY_AISLE_ORDER) {
    if (key === "pantry") return "pantry";
    if (GROCERY_AISLE_PATTERNS[key].test(haystack)) return key;
  }
  return "pantry";
}

export function groceryAisleLabelKey(aisle) {
  const keys = {
    produce: "aisleProduce",
    dairy: "aisleDairy",
    meat: "aisleMeat",
    bakery: "aisleBakery",
    frozen: "aisleFrozen",
    pantry: "aislePantry",
  };
  return keys[aisle] || keys.pantry;
}

export function groceryAisleOrder() {
  return [...GROCERY_AISLE_ORDER];
}

export function groceryRowParts(text) {
  const cleaned = cleanIngredientForGrocery(text);
  if (!cleaned) return { name: "", quantityLabel: "" };
  const parsed = parseIngredientAmount(cleaned);
  if (!(parsed.quantity > 0)) return { name: stripGroceryPrepChrome(cleaned), quantityLabel: "" };
  const tokens = `${parsed.remainder || ""}`.trim().split(/\s+/).filter(Boolean);
  const first = (tokens[0] || "").toLowerCase().replace(/\.$/, "");
  if (tokens.length > 1 && GROCERY_UNIT_WORDS.has(first)) {
    return {
      name: stripGroceryPrepChrome(tokens.slice(1).join(" ")),
      quantityLabel: `${formatIngredientAmount(parsed.quantity)} ${tokens[0]}`,
    };
  }
  return {
    name: stripGroceryPrepChrome(parsed.remainder || cleaned),
    quantityLabel: formatIngredientAmount(parsed.quantity),
  };
}

function fractionValue(value) {
  const [numerator, denominator] = `${value}`.split("/").map(Number);
  return denominator ? numerator / denominator : 0;
}

const UNICODE_FRACTIONS = { "¼": "1/4", "½": "1/2", "¾": "3/4", "⅐": "1/7", "⅑": "1/9", "⅒": "1/10", "⅓": "1/3", "⅔": "2/3", "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5", "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8" };

export function parseIngredientAmount(value) {
  const text = cleanIngredientForGrocery(value).replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (fraction) => ` ${UNICODE_FRACTIONS[fraction]}`);
  const match = text.match(/^(?:(\d+)\s+)?(\d+(?:\/\d+|\.\d+)?)(?:\s*[-–]\s*\d+(?:\/\d+|\.\d+)?)?\s+(.+)$/);
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
  inventorySuggested = false,
  inventoryDecision = "",
} = {}) {
  const timestamp = new Date().toISOString();
  return {
    id: `grocery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: typeof text === "string"
      ? updateLocalizedText("", cleanIngredientForGrocery(text), lang)
      : text,
    checked: inventoryDecision === "have",
    store,
    source,
    recipeId,
    recipeName: typeof recipeName === "string" ? localizedTextMap(recipeName) : recipeName,
    inInventory: inventoryDecision === "have",
    inventorySuggested: Boolean(inventoryItem || inventorySuggested),
    ...(inventoryDecision ? { inventoryDecision } : (inventoryItem ? { inventoryDecision: "review" } : {})),
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
        inventorySuggested: existingItem.inventorySuggested || item.inventorySuggested,
        inventoryDecision: existingItem.inventoryDecision || item.inventoryDecision,
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
  const previous = new Map(existing
    .filter((item) => ["meal-plan", "week-plan"].includes(item.source) && item.ingredientKey)
    .map((item) => [item.ingredientKey, item]));
  const rebuilt = mergeGroceries([], generated).map((item) => {
    const old = previous.get(item.ingredientKey);
    return old ? { ...item, checked: Boolean(old.checked), inInventory: Boolean(old.inInventory), inventoryDecision: old.inventoryDecision || item.inventoryDecision, inventorySuggested: Boolean(old.inventorySuggested || item.inventorySuggested), updatedBy: old.updatedBy || item.updatedBy, updatedAt: old.updatedAt || item.updatedAt } : item;
  });
  return [...retained, ...rebuilt];
}

export function applyInventoryCoverage(items, inventory) {
  return items.map((item) => {
    if (!Object.keys(item.plannedQuantities || {}).length) return item;
    const inventoryItem = inventoryMatchFor(inventory, item.ingredientRemainders || item.text);
    if (!inventoryItem) return {
      ...item,
      inInventory: false,
      inventorySuggested: false,
      inventoryDecision: item.inventoryDecision === "have" ? "need" : item.inventoryDecision,
      checked: item.inventoryDecision === "have" ? false : item.checked,
    };
    const remainingQuantities = {};
    for (const lang of ["en", "es"]) {
      const needed = Number(item.plannedQuantities?.[lang] || 0);
      if (!(needed > 0)) continue;
      const compatible = normalizedUnit(item.plannedUnits?.[lang]) === normalizedUnit(inventoryItem.unit || "each");
      const remaining = compatible ? Math.max(0, needed - (Number(inventoryItem.amount) || 0)) : needed;
      remainingQuantities[lang] = remaining;
    }
    const explicitDecision = ["review", "need", "have"].includes(item.inventoryDecision)
      ? item.inventoryDecision
      : "review";
    return {
      ...item,
      remainingQuantities,
      inventorySuggested: true,
      inventoryDecision: explicitDecision,
      inInventory: explicitDecision === "have",
      checked: explicitDecision === "have" ? true : Boolean(item.checked && !item.inInventory),
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
