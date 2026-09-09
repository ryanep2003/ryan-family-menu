const ACTION_TYPES = new Set([
  "none", "open_meal", "open_recipe", "open_shop", "open_inventory", "open_lunches", "open_budget",
  "fill_gaps", "refresh_shopping", "add_grocery", "edit_grocery", "change_meal", "add_inventory",
  "update_inventory", "update_leftovers",
]);
const PERIODS = new Set(["breakfast", "lunch", "dinner"]);
const STOCK_STATES = new Set(["full", "some", "low", "out"]);
const LOCATIONS = new Set(["pantry", "fridge", "freezer", "household"]);
const MEAL_MODES = new Set(["add", "replace"]);

function text(value, max = 160) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function id(value) {
  const clean = text(value, 180);
  return /^[a-z-]+:[A-Za-z0-9_.:-]{1,160}$/.test(clean) ? clean : "";
}

function dateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}` === value ? value : "";
}

function number(value, min, max) {
  if (typeof value !== "number") return null;
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function onlyAllowedArgs(args, allowed) {
  return Object.entries(args).every(([key, value]) => allowed.has(key) || value === null || value === undefined);
}

export { ACTION_TYPES as ASSISTANT_PROPOSAL_TYPES };

/** Validates a model proposal against only source IDs/dates the browser sent. */
export function normalizeAssistantProposal(action, { sourceIds = new Set(), sourceTypes = new Map(), dateKeys: allowedDates = new Set() } = {}) {
  const type = ACTION_TYPES.has(action?.type) ? action.type : "none";
  const sourceId = id(action?.sourceId);
  const args = action?.args && typeof action.args === "object" ? action.args : {};
  const sourceAllowed = !sourceId || sourceIds.has(sourceId);
  if (!sourceAllowed) return { type: "none", sourceId: "", args: {} };
  const isSourceType = (expected) => sourceId && sourceTypes.get(sourceId) === expected;
  const noArgs = new Set();
  if (type === "open_meal") return isSourceType("meal") && onlyAllowedArgs(args, noArgs) ? { type, sourceId, args: {} } : { type: "none", sourceId: "", args: {} };
  if (type === "open_recipe") return isSourceType("recipe") && onlyAllowedArgs(args, noArgs) ? { type, sourceId, args: {} } : { type: "none", sourceId: "", args: {} };
  if (["fill_gaps", "open_shop", "open_inventory", "open_lunches", "open_budget", "none"].includes(type)) return onlyAllowedArgs(args, noArgs) ? { type, sourceId: "", args: {} } : { type: "none", sourceId: "", args: {} };
  const allowedByType = {
    refresh_shopping: new Set(["dateKeys"]), add_grocery: new Set(["text", "store"]), edit_grocery: new Set(["text", "checked"]),
    change_meal: new Set(["dateKey", "recipeSourceId", "period", "mode", "servings"]), add_inventory: new Set(["text", "location", "stockState", "amount", "unit"]),
    update_inventory: new Set(["stockState", "amount"]), update_leftovers: new Set(["dateKey", "recipeSourceId", "servings"]),
  };
  if (allowedByType[type] && !onlyAllowedArgs(args, allowedByType[type])) return { type: "none", sourceId: "", args: {} };
  if (type === "refresh_shopping") {
    if (!Array.isArray(args.dateKeys) || !args.dateKeys.length || args.dateKeys.length > 14) return { type: "none", sourceId: "", args: {} };
    const dateKeys = args.dateKeys.map(dateKey);
    if (dateKeys.some((key) => !key || !allowedDates.has(key)) || new Set(dateKeys).size !== dateKeys.length) return { type: "none", sourceId: "", args: {} };
    return { type, sourceId: "", args: { dateKeys } };
  }
  if (type === "add_grocery") {
    const itemText = text(args.text, 160);
    return itemText ? { type, sourceId: "", args: { text: itemText, store: text(args.store, 80) } } : { type: "none", sourceId: "", args: {} };
  }
  if (type === "edit_grocery") {
    if (!isSourceType("grocery")) return { type: "none", sourceId: "", args: {} };
    const itemText = text(args.text, 160);
    const checked = typeof args.checked === "boolean" ? args.checked : null;
    return itemText || checked !== null ? { type, sourceId, args: { ...(itemText ? { text: itemText } : {}), ...(checked !== null ? { checked } : {}) } } : { type: "none", sourceId: "", args: {} };
  }
  if (type === "change_meal") {
    const targetDate = dateKey(args.dateKey);
    const recipeId = id(args.recipeSourceId);
    const period = PERIODS.has(args.period) ? args.period : "";
    const servings = number(args.servings, 0, 20);
    if (!targetDate || !allowedDates.has(targetDate) || !recipeId.startsWith("recipe:") || sourceTypes.get(recipeId) !== "recipe" || !period) return { type: "none", sourceId: "", args: {} };
    const mode = MEAL_MODES.has(args.mode) ? args.mode : "";
    if (!mode) return { type: "none", sourceId: "", args: {} };
    return { type, sourceId, args: { dateKey: targetDate, recipeSourceId: recipeId, period, mode, ...(servings !== null ? { servings } : {}) } };
  }
  if (type === "add_inventory") {
    const itemText = text(args.text, 160);
    if (!itemText) return { type: "none", sourceId: "", args: {} };
    const amount = number(args.amount, 0, 10000);
    if ((args.location !== null && args.location !== undefined && !LOCATIONS.has(args.location)) || (args.stockState !== null && args.stockState !== undefined && !STOCK_STATES.has(args.stockState)) || (text(args.unit, 40) && amount === null)) return { type: "none", sourceId: "", args: {} };
    return { type, sourceId: "", args: { text: itemText, ...(LOCATIONS.has(args.location) ? { location: args.location } : {}), ...(STOCK_STATES.has(args.stockState) ? { stockState: args.stockState } : {}), ...(amount !== null ? { amount } : {}), ...(text(args.unit, 40) ? { unit: text(args.unit, 40) } : {}) } };
  }
  if (type === "update_inventory") {
    if (!isSourceType("inventory")) return { type: "none", sourceId: "", args: {} };
    const amount = number(args.amount, 0, 10000);
    if (args.stockState !== null && args.stockState !== undefined && !STOCK_STATES.has(args.stockState)) return { type: "none", sourceId: "", args: {} };
    const stockState = STOCK_STATES.has(args.stockState) ? args.stockState : "";
    return stockState || amount !== null ? { type, sourceId, args: { ...(stockState ? { stockState } : {}), ...(amount !== null ? { amount } : {}) } } : { type: "none", sourceId: "", args: {} };
  }
  if (type === "update_leftovers") {
    const targetDate = dateKey(args.dateKey);
    const recipeId = id(args.recipeSourceId);
    const servings = number(args.servings, 0, 100);
    if (!targetDate || !allowedDates.has(targetDate) || !recipeId.startsWith("recipe:") || sourceTypes.get(recipeId) !== "recipe" || servings === null) return { type: "none", sourceId: "", args: {} };
    return { type, sourceId, args: { dateKey: targetDate, recipeSourceId: recipeId, servings } };
  }
  return { type, sourceId, args: {} };
}
