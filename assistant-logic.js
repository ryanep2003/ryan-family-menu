import { rankedRecipes } from "./memory-logic.js";
import { categoryFor } from "./recipe-utils.js";
import {
  activeWeekDateKeys,
  appendRecipeToMeal,
  currentWeekStartKey,
  dateFromKey,
  formatDateKey,
  normalizeMealPlan,
} from "./schedule-utils.js";
import { mergeGroceries, replacePlannedGroceries } from "./grocery-logic.js";

export const ASSISTANT_HORIZON_DAYS = 7;

export const ASSISTANT_ACTIONS = [
  "plan-next-week",
  "fill-gaps",
  "refresh-shopping",
  "dinner-today",
  "dinner-tomorrow",
];

export function normalizeAskText(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[''`´]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function paddedAsk(text) {
  return ` ${text} `;
}

function askHasAny(text, phrases) {
  const haystack = paddedAsk(text);
  return phrases.some((phrase) => haystack.includes(` ${phrase} `));
}

function askHasTomorrow(query) {
  if (askHasAny(query, ["esta manana", "this morning"])) return false;
  return askHasAny(query, ["tomorrow", "tomorrow night", "tomorrow evening", "manana"]);
}

function askHasToday(query) {
  return askHasAny(query, [
    "today",
    "tonight",
    "this evening",
    "this afternoon",
    "this morning",
    "hoy",
    "esta noche",
    "esta tarde",
    "esta manana",
  ]);
}

const SHOPPING_WORDS = [
  "shopping list", "grocery list", "lista de compras", "lista de la compra", "lista del super",
  "shopping", "groceries", "grocery", "compras", "supermercado",
];
const SHOPPING_COMMANDS = [
  "build shopping", "build a shopping", "build the shopping", "refresh shopping", "refresh the shopping",
  "refresh grocery", "refresh the grocery", "create shopping", "create a shopping", "generate shopping",
  "generate a shopping", "rebuild shopping", "rebuild the shopping", "crear lista de compras", "actualizar lista de compras",
  "generar lista de compras", "refrescar lista de compras", "reconstruir lista de compras",
];
const UNSUPPORTED_SHOPPING_CONSTRAINTS = [
  "budget", "cost", "price", "under ", "below ", "cheap", "cheaper", "diet", "dietary", "substitute",
  "substitution", "swap", "replace", "gluten free", "vegan", "keto", "presupuesto", "costo", "precio",
  "barato", "dieta", "sustitu", "reemplaz", "sin gluten", "vegano", "dairy", "without ", "sin lacteos",
];

function queryContains(query, phrases) {
  return phrases.some((phrase) => query.includes(phrase));
}

function askIsNegated(query) {
  return /(^|\s)(?:dont|do not|no)(?:\s|$)/.test(query)
    || queryContains(query, ["no quiero", "no planees", "no llenes", "no actualices", "no generes"]);
}

function askIsCapabilityQuestion(query) {
  return /^(?:how|can|could|would|explain|como|puedo|puedes|podrias|me puedes)\b/.test(query);
}

function shoppingDateWindow(query) {
  if (queryContains(query, ["tomorrow only", "for tomorrow", "manana solamente", "para manana"])) return "tomorrow";
  if (queryContains(query, ["today only", "for today", "hoy solamente", "para hoy"])) return "today";
  return "";
}

function hasUnresolvedShoppingDateConstraint(query) {
  return askHasAny(query, [
    "next week", "this week", "coming week", "following week", "proxima semana", "esta semana", "semana que viene",
  ]);
}

export function classifyAskIntent(text) {
  const query = normalizeAskText(text);
  if (!query) return { kind: "unmatched" };

  if (askHasAny(query, SHOPPING_WORDS)) {
    if (askIsNegated(query)) return { kind: "shopping-negated" };
    if (queryContains(query, UNSUPPORTED_SHOPPING_CONSTRAINTS)) return { kind: "shopping-unsupported" };
    if (askIsCapabilityQuestion(query)) return { kind: "shopping-clarification" };
    if (queryContains(query, SHOPPING_COMMANDS)) {
      const dateWindow = shoppingDateWindow(query);
      if (dateWindow) return { kind: "action", action: "refresh-shopping", dateWindow };
      if (hasUnresolvedShoppingDateConstraint(query)) return { kind: "shopping-clarification" };
      return { kind: "action", action: "refresh-shopping" };
    }
    return { kind: "shopping-clarification" };
  }

  if (askIsNegated(query)) return { kind: "unmatched" };

  if (askHasAny(query, ["fill gaps", "fill the gaps", "fill empty", "empty dinners", "empty dinner", "completar huecos"])) {
    return { kind: "action", action: "fill-gaps" };
  }
  if (askHasAny(query, ["plan next week", "plan dinners", "plan meals", "plan the week", "help me plan", "planear", "planea", "planificar"]) || query === "plan") {
    return { kind: "action", action: "plan-next-week" };
  }
  if (askHasAny(query, [
    "next week", "coming week", "following week", "the week after", "proxima semana",
    "la semana proxima", "semana que viene", "la semana que viene", "semana siguiente", "this week", "esta semana",
  ])) return { kind: "unmatched" };

  const dinner = askHasAny(query, ["dinner", "supper", "cena", "cenar", "cenamos"]);
  const meals = askHasAny(query, ["lunch", "almuerzo", "breakfast", "desayuno", "comida", "meals", "meal"]);
  const whatsFor = askHasAny(query, ["whats for", "what is for", "what for", "que hay", "que hay de", "que hay para", "que comemos", "que cenamos"]);
  const tomorrow = askHasTomorrow(query);
  const today = askHasToday(query);
  if (tomorrow && (dinner || meals || whatsFor)) return { kind: "action", action: "dinner-tomorrow" };
  if (today && (dinner || meals || whatsFor)) return { kind: "action", action: "dinner-today" };
  if (dinner || whatsFor) return { kind: "action", action: "dinner-today" };

  return { kind: "unmatched" };
}

export function matchAskAction(text) {
  return classifyAskIntent(text).action || null;
}

const NON_DINNER_CATEGORIES = new Set(["side", "salad", "sauce", "dessert", "drink"]);

function dateAtNoon(now = new Date()) {
  const date = new Date(now);
  date.setHours(12, 0, 0, 0);
  return date;
}

export function horizonDateKeys(now = new Date(), days = ASSISTANT_HORIZON_DAYS) {
  const start = dateAtNoon(now);
  const count = Math.max(1, Math.min(ASSISTANT_HORIZON_DAYS, Number(days) || ASSISTANT_HORIZON_DAYS));
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return formatDateKey(date);
  });
}

export function remainingWeekDateKeys(now = new Date()) {
  const todayKey = formatDateKey(now);
  return activeWeekDateKeys(currentWeekStartKey(now))
    .map((day) => day.dateKey)
    .filter((dateKey) => dateKey >= todayKey);
}

export function nextWeekDateKeys(now = new Date()) {
  const thisMonday = dateFromKey(currentWeekStartKey(now));
  thisMonday.setDate(thisMonday.getDate() + 7);
  return activeWeekDateKeys(formatDateKey(thisMonday)).map((day) => day.dateKey);
}

export function dateKeysForAction(action, now = new Date()) {
  if (action === "fill-gaps") return remainingWeekDateKeys(now);
  if (action === "refresh-shopping") return horizonDateKeys(now);
  return nextWeekDateKeys(now);
}

function addLocalDays(dateKey, days) {
  const date = dateFromKey(dateKey);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

export function relativeDinnerDateKey(which = "today", now = new Date()) {
  const todayKey = formatDateKey(now);
  if (which === "tomorrow" || which === "dinner-tomorrow") return addLocalDays(todayKey, 1);
  return todayKey;
}

export function dinnerItems(meal) {
  return normalizeMealPlan(meal).items.filter((item) => item.period === "dinner");
}

export function dinnerIsOccupied(meal) {
  return dinnerItems(meal).length > 0;
}

function dinnerEligibleRecipes(recipes = []) {
  const list = recipes.filter((recipe) => recipe && recipe.id);
  const mains = list.filter((recipe) => categoryFor(recipe) === "main");
  if (mains.length) return mains;
  return list.filter((recipe) => !NON_DINNER_CATEGORIES.has(categoryFor(recipe)));
}

function recentWinIds(events = []) {
  const ids = [];
  const seen = new Set();
  for (const event of events) {
    if (event?.outcome !== "loved" && event?.outcome !== "worked") continue;
    for (const item of event.items || []) {
      if (!item?.recipeId || seen.has(item.recipeId)) continue;
      seen.add(item.recipeId);
      ids.push(item.recipeId);
    }
  }
  return ids;
}

export function dinnerSuggestionPool({
  recipes = [],
  favorites = [],
  events = [],
  members = [],
  preferences = [],
  rules = {},
  recipeFeedback = {},
  excludeIds = [],
} = {}) {
  const eligible = dinnerEligibleRecipes(recipes);
  const byId = new Map(eligible.map((recipe) => [recipe.id, recipe]));
  const ranked = rankedRecipes(eligible, {
    events,
    members,
    preferences,
    rules,
    recipeFeedback,
  });
  const allowed = new Set(ranked.map(({ recipe }) => recipe.id));
  const excluded = new Set(excludeIds);
  const ordered = [];
  const seen = new Set();
  const push = (id, source) => {
    if (!id || seen.has(id) || excluded.has(id) || !allowed.has(id) || !byId.has(id)) return;
    seen.add(id);
    ordered.push({ recipe: byId.get(id), source });
  };
  (Array.isArray(favorites) ? favorites : []).forEach((id) => push(id, "favorite"));
  recentWinIds(events).forEach((id) => push(id, "recent-win"));
  ranked.forEach(({ recipe }) => push(recipe.id, "library"));
  return ordered;
}

function pickSuggestion(pool, usedCount) {
  if (!pool.length) return null;
  return pool[usedCount % pool.length];
}

export function proposeDinnerFill({
  action = "plan-next-week",
  dateKeys,
  now = new Date(),
  mealForDate = () => ({}),
  recipes = [],
  favorites = [],
  events = [],
  members = [],
  preferences = [],
  rules = {},
  recipeFeedback = {},
} = {}) {
  const windowKeys = Array.isArray(dateKeys) ? dateKeys : dateKeysForAction(action, now);
  const occupied = [];
  const emptyKeys = [];
  windowKeys.forEach((dateKey) => {
    const meal = mealForDate(dateKey);
    if (dinnerIsOccupied(meal)) {
      occupied.push({
        dateKey,
        recipeIds: dinnerItems(meal).map((item) => item.recipeId),
      });
    } else {
      emptyKeys.push(dateKey);
    }
  });

  const plannedIds = new Set(occupied.flatMap((entry) => entry.recipeIds));
  const pool = dinnerSuggestionPool({
    recipes,
    favorites,
    events,
    members,
    preferences,
    rules,
    recipeFeedback,
    excludeIds: plannedIds,
  });

  const assignments = [];
  const unfilled = [];
  emptyKeys.forEach((dateKey, index) => {
    const pick = pickSuggestion(pool, index);
    if (!pick) {
      unfilled.push({ dateKey, reason: "no-recipes" });
      return;
    }
    assignments.push({
      dateKey,
      recipeId: pick.recipe.id,
      source: pick.source,
    });
  });

  return {
    kind: "fill-dinners",
    action,
    dateKeys: windowKeys,
    assignments,
    occupied,
    unfilled,
  };
}

export function applyDinnerAssignments({
  calendarMeals = {},
  assignments = [],
  mealForDate = (dateKey) => calendarMeals[dateKey],
} = {}) {
  const next = { ...calendarMeals };
  const applied = [];
  const skipped = [];

  assignments.forEach((assignment) => {
    const dateKey = assignment?.dateKey;
    const recipeId = typeof assignment?.recipeId === "string" ? assignment.recipeId.trim() : "";
    if (!dateKey || !recipeId) {
      skipped.push({ ...assignment, reason: "invalid" });
      return;
    }
    const current = Object.prototype.hasOwnProperty.call(next, dateKey)
      ? next[dateKey]
      : mealForDate(dateKey);
    if (dinnerIsOccupied(current)) {
      skipped.push({ ...assignment, reason: "occupied" });
      return;
    }
    next[dateKey] = appendRecipeToMeal(current, {
      recipeId,
      period: "dinner",
      role: "main",
    });
    applied.push({ dateKey, recipeId, source: assignment.source || "library" });
  });

  return { calendarMeals: next, applied, skipped };
}

function shoppingItemKey(item, index) {
  if (["meal-plan", "week-plan"].includes(item?.source) && item?.ingredientKey) return `planned:${item.ingredientKey}`;
  return `item:${item?.id || index}`;
}

function shoppingItemSignature(item) {
  return JSON.stringify({
    source: item?.source || "",
    ingredientKey: item?.ingredientKey || "",
    text: item?.text || "",
    store: item?.store || "",
    recipeId: item?.recipeId || "",
    recipeName: item?.recipeName || "",
    updatedBy: item?.updatedBy || "",
    checked: Boolean(item?.checked),
    inInventory: Boolean(item?.inInventory),
    inventorySuggested: Boolean(item?.inventorySuggested),
    inventoryDecision: item?.inventoryDecision || "",
    plannedQuantities: item?.plannedQuantities || {},
    remainingQuantities: item?.remainingQuantities || {},
    ingredientRemainders: item?.ingredientRemainders || {},
    plannedUnits: item?.plannedUnits || {},
    mealUses: item?.mealUses || [],
  });
}

export function shoppingRefreshChanges(existingItems = [], proposedItems = []) {
  const before = new Map((Array.isArray(existingItems) ? existingItems : []).map((item, index) => [shoppingItemKey(item, index), item]));
  const after = new Map((Array.isArray(proposedItems) ? proposedItems : []).map((item, index) => [shoppingItemKey(item, index), item]));
  const added = [];
  const removed = [];
  const changed = [];
  after.forEach((item, key) => {
    if (!before.has(key)) added.push(item);
    else if (shoppingItemSignature(before.get(key)) !== shoppingItemSignature(item)) changed.push({ before: before.get(key), after: item });
  });
  before.forEach((item, key) => {
    if (!after.has(key)) removed.push(item);
  });
  return { added, removed, changed };
}

export function shoppingRefreshFingerprint(items = []) {
  return JSON.stringify((Array.isArray(items) ? items : []).map((item, index) => ({
    key: shoppingItemKey(item, index),
    signature: shoppingItemSignature(item),
  })).sort((a, b) => a.key.localeCompare(b.key)));
}

export function proposeShoppingRefresh({ generatedItems = [], existingItems = [], proposedItems } = {}) {
  const generated = Array.isArray(generatedItems) ? generatedItems : [];
  const existing = Array.isArray(existingItems) ? existingItems : [];
  const next = Array.isArray(proposedItems) ? proposedItems : replacePlannedGroceries(existing, generated);
  const generatedCount = mergeGroceries([], generated).length;
  const changes = shoppingRefreshChanges(existing, next);
  return {
    kind: "shopping",
    generatedCount,
    listCount: next.length,
    proposedItems: next,
    changes,
    fingerprint: shoppingRefreshFingerprint(next),
    inputFingerprint: shoppingRefreshFingerprint(existing),
    hasChanges: Boolean(changes.added.length || changes.removed.length || changes.changed.length),
    retainedManualCount: existing.filter((item) => !["meal-plan", "week-plan"].includes(item.source)).length,
  };
}

export function shoppingListAfterRefresh({ generatedItems = [], existingItems = [] } = {}) {
  return replacePlannedGroceries(
    Array.isArray(existingItems) ? existingItems : [],
    Array.isArray(generatedItems) ? generatedItems : [],
  );
}

export function lookupDinner({ dateKey, meal, todayKey, when } = {}) {
  const items = dinnerItems(meal);
  const resolvedWhen = when === "today" || when === "tomorrow"
    ? when
    : dateKey && todayKey && dateKey === todayKey ? "today" : "tomorrow";
  return {
    kind: "dinner-lookup",
    dateKey,
    when: resolvedWhen,
    empty: items.length === 0,
    items: items.map((item) => ({
      recipeId: item.recipeId,
      role: item.role,
      sourceType: item.sourceType,
    })),
  };
}

export function assistantPreviewNeedsConfirm(preview) {
  if (!preview) return false;
  if (preview.kind === "fill-dinners") return preview.assignments.length > 0;
  if (preview.kind === "shopping") return preview.hasChanges;
  return false;
}
