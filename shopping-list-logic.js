const SCOPES = new Set(["day", "two-days", "recipe", "lunch", "snapshot"]);
const RANGES = new Set(["week", "next3", "nextWeek", "next14", "month"]);
const MAX_ITEMS_PER_LIST = 300;
const MAX_TOTAL_ITEMS = 3000;

function boundedText(value, max = 160) {
  return `${value || ""}`.trim().slice(0, max);
}

function validDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(`${value || ""}`) ? `${value}` : "";
}

export function normalizeShoppingList(value) {
  if (!value || typeof value !== "object") return null;
  const scope = SCOPES.has(value.scope) ? value.scope : "snapshot";
  const dateKeys = Array.isArray(value.dateKeys)
    ? value.dateKeys.map(validDateKey).filter(Boolean).slice(0, 14)
    : [];
  return {
    id: boundedText(value.id, 180) || `shopping-list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: boundedText(value.name, 120) || "Saved shopping list",
    scope,
    ...(RANGES.has(value.range) ? { range: value.range } : {}),
    ...(validDateKey(value.dateKey) ? { dateKey: validDateKey(value.dateKey) } : {}),
    ...(dateKeys.length ? { dateKeys } : {}),
    ...(boundedText(value.recipeId, 160) ? { recipeId: boundedText(value.recipeId, 160) } : {}),
    ...(boundedText(value.memberId, 160) ? { memberId: boundedText(value.memberId, 160) } : {}),
    ...(new Set(["breakfast", "lunch", "dinner"]).has(value.mealSlot) ? { mealSlot: value.mealSlot } : {}),
    items: Array.isArray(value.items) ? value.items.slice(0, MAX_ITEMS_PER_LIST) : [],
    createdAt: value.createdAt || new Date().toISOString(),
    updatedAt: value.updatedAt || value.createdAt || new Date().toISOString(),
    ...(boundedText(value.updatedBy, 80) ? { updatedBy: boundedText(value.updatedBy, 80) } : {}),
  };
}

export function normalizeShoppingLists(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const lists = value
    .map(normalizeShoppingList)
    .filter((list) => list && !seen.has(list.id) && seen.add(list.id))
    .slice(0, 100);
  let remaining = MAX_TOTAL_ITEMS;
  return lists.map((list) => {
    const items = list.items.slice(0, remaining);
    remaining -= items.length;
    return { ...list, items };
  }).filter((list) => list.items.length || remaining >= 0);
}

export function shoppingListScopeLabelKey(list) {
  if (list?.scope === "day") return "shoppingListOneDay";
  if (list?.scope === "two-days") return "shoppingListTwoDays";
  if (list?.scope === "recipe") return "shoppingListOneRecipe";
  if (list?.scope === "lunch") return "shoppingListOneLunch";
  return "shoppingListSavedSnapshot";
}
