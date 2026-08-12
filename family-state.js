import { normalizeCalendar, normalizeSchedule } from "./schedule-utils.js";
import { normalizeAvailableFood } from "./available-food.js";

export function sharedStateSnapshot({
  weekStartKey,
  schedule,
  calendarMeals,
  favorites,
  tasks,
  availableFood = [],
  recipeEdits,
  deletedRecipeIds,
}) {
  return { weekStart: weekStartKey, schedule, calendarMeals, favorites, tasks, availableFood, recipeEdits, deletedRecipeIds };
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
    recipeEdits: remoteState.recipeEdits && typeof remoteState.recipeEdits === "object"
      ? remoteState.recipeEdits
      : fallbacks.recipeEdits,
    deletedRecipeIds: Array.isArray(remoteState.deletedRecipeIds)
      ? remoteState.deletedRecipeIds
      : fallbacks.deletedRecipeIds,
  };
}

export function persistSharedState(storage, state, version) {
  storage.setItem("dinner-schedule", JSON.stringify(state.schedule));
  storage.setItem("dinner-calendar", JSON.stringify(state.calendarMeals));
  storage.setItem("dinner-week-start", state.weekStartKey);
  storage.setItem("dinner-state-version", `${version}`);
  storage.setItem("dinner-favorites", JSON.stringify(state.favorites));
  storage.setItem("dinner-tasks", JSON.stringify(state.tasks));
  storage.setItem("dinner-available-food", JSON.stringify(normalizeAvailableFood(state.availableFood)));
  storage.setItem("dinner-recipe-edits", JSON.stringify(state.recipeEdits));
  storage.setItem("dinner-deleted-recipes", JSON.stringify(state.deletedRecipeIds));
}
