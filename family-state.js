import { normalizeCalendar, normalizeSchedule } from "./schedule-utils.js";
import { normalizeAvailableFood } from "./available-food.js";
import { normalizeBudgetSettings, normalizeReceipts } from "./budget-logic.js";
import { normalizeActivity } from "./activity-logic.js";

const RECIPE_OUTCOMES = ["made", "loved", "repeat", "skip"];
const MAX_RECIPE_FEEDBACK = 300;

function cleanFeedbackCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.min(1000, Math.floor(count))) : 0;
}

function cleanFeedbackEntry(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    made: cleanFeedbackCount(source.made),
    loved: cleanFeedbackCount(source.loved),
    repeat: cleanFeedbackCount(source.repeat),
    skip: cleanFeedbackCount(source.skip),
    lastOutcome: RECIPE_OUTCOMES.includes(source.lastOutcome) ? source.lastOutcome : "",
    lastMadeAt: typeof source.lastMadeAt === "string" ? source.lastMadeAt.slice(0, 40) : "",
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt.slice(0, 40) : "",
    updatedBy: typeof source.updatedBy === "string" ? source.updatedBy.slice(0, 80) : "",
  };
}

export function normalizeRecipeFeedback(value) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_RECIPE_FEEDBACK)
      .map(([recipeId, entry]) => [`${recipeId || ""}`.trim().slice(0, 160), cleanFeedbackEntry(entry)])
      .filter(([recipeId]) => recipeId)
  );
}

export function recordRecipeOutcome(value, recipeId, outcome, updatedBy = "", timestamp = new Date().toISOString()) {
  const id = `${recipeId || ""}`.trim().slice(0, 160);
  if (!id || !RECIPE_OUTCOMES.includes(outcome)) return normalizeRecipeFeedback(value);

  const feedback = normalizeRecipeFeedback(value);
  const current = feedback[id] || cleanFeedbackEntry({});
  const next = {
    ...current,
    [outcome]: current[outcome] + 1,
    lastOutcome: outcome,
    updatedAt: timestamp,
    updatedBy: `${updatedBy || ""}`.trim().slice(0, 80),
  };
  if (outcome === "loved" || outcome === "repeat") next.made += 1;
  if (outcome === "made" || outcome === "loved" || outcome === "repeat") next.lastMadeAt = timestamp;

  return { ...feedback, [id]: next };
}

export function sharedStateSnapshot({
  weekStartKey,
  schedule,
  calendarMeals,
  favorites,
  tasks,
  availableFood = [],
  recipeFeedback = {},
  budgetSettings = {},
  receipts = [],
  activity = [],
  recipeEdits,
  deletedRecipeIds,
}) {
  return { weekStart: weekStartKey, schedule, calendarMeals, favorites, tasks, availableFood, recipeFeedback, budgetSettings, receipts, activity, recipeEdits, deletedRecipeIds };
}

export function normalizeSharedState(remoteState = {}, fallbacks = {}) {
  return {
    weekStartKey: remoteState.weekStart || fallbacks.weekStartKey,
    schedule: normalizeSchedule(remoteState.schedule),
    calendarMeals: normalizeCalendar(remoteState.calendarMeals),
    favorites: Array.isArray(remoteState.favorites) ? remoteState.favorites : fallbacks.favorites,
    tasks: Array.isArray(remoteState.tasks) ? remoteState.tasks : fallbacks.tasks,
    availableFood: Array.isArray(remoteState.availableFood)
      ? normalizeAvailableFood(remoteState.availableFood)
      : normalizeAvailableFood(fallbacks.availableFood),
    recipeFeedback: normalizeRecipeFeedback(remoteState.recipeFeedback || fallbacks.recipeFeedback),
    budgetSettings: normalizeBudgetSettings(remoteState.budgetSettings || fallbacks.budgetSettings),
    receipts: normalizeReceipts(Array.isArray(remoteState.receipts) ? remoteState.receipts : fallbacks.receipts),
    activity: normalizeActivity(Array.isArray(remoteState.activity) ? remoteState.activity : fallbacks.activity),
    recipeEdits: remoteState.recipeEdits && typeof remoteState.recipeEdits === "object"
      ? remoteState.recipeEdits
      : fallbacks.recipeEdits,
    deletedRecipeIds: Array.isArray(remoteState.deletedRecipeIds)
      ? remoteState.deletedRecipeIds
      : fallbacks.deletedRecipeIds,
  };
}

export function persistSharedState(storage, state, version) {
  try {
    // Compact recipe edits are the largest cache entry. Write them first so a
    // migration from an older photo-heavy value frees quota for the rest.
    storage.setItem("dinner-recipe-edits", JSON.stringify(state.recipeEdits));
    storage.setItem("dinner-schedule", JSON.stringify(state.schedule));
    storage.setItem("dinner-calendar", JSON.stringify(state.calendarMeals));
    storage.setItem("dinner-week-start", state.weekStartKey);
    storage.setItem("dinner-state-version", `${version}`);
    storage.setItem("dinner-favorites", JSON.stringify(state.favorites));
    storage.setItem("dinner-tasks", JSON.stringify(state.tasks));
    storage.setItem("dinner-available-food", JSON.stringify(normalizeAvailableFood(state.availableFood)));
    storage.setItem("dinner-recipe-feedback", JSON.stringify(normalizeRecipeFeedback(state.recipeFeedback)));
    storage.setItem("dinner-budget-settings", JSON.stringify(normalizeBudgetSettings(state.budgetSettings)));
    storage.setItem("dinner-receipts", JSON.stringify(normalizeReceipts(state.receipts)));
    storage.setItem("dinner-activity", JSON.stringify(normalizeActivity(state.activity)));
    storage.setItem("dinner-deleted-recipes", JSON.stringify(state.deletedRecipeIds));
    return true;
  } catch {
    // Remote synchronization must continue even when a browser's local cache
    // is full or unavailable (notably Safari private storage).
    return false;
  }
}
