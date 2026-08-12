import { getStore } from "@netlify/blobs";
import { requireWriteAuth } from "./_auth.js";
import { jsonResponse, readJsonRequest } from "./_http.js";
import { hasVersionConflict, nextVersionedRecord, versionedRecord } from "./_versioned-record.js";
import { cleanLocalizedText, hasLocalizedContent } from "../../localized-data.js";
import { normalizeRecipeFeedback } from "../../family-state.js";

const STORE_NAME = "family-menu-state";
const STATE_KEY = "shared-state";
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MEAL_KEYS = ["breakfast", "lunch", "dinner", "main", "side", "salad", "notes"];
const MAX_CALENDAR_DAYS = 730;
const MAX_FAVORITES = 100;
const MAX_TASKS = 300;
const MAX_RECIPE_EDITS = 300;
const MAX_DELETED_RECIPES = 300;
const MAX_AVAILABLE_FOOD = 100;
const MAX_PHOTO_BYTES = 500000;
const MAX_REQUEST_BYTES = 3000000;
const TASK_ASSIGNEES = ["alyson", "eric", "nelly", "theo", "pierce", "other"];
const LEFTOVER_SERVINGS = ["one", "two", "threePlus"];
const LEFTOVER_USE_FIRST = ["lunch", "snack", "nextDinner", "any"];
const SNACK_STATUS = ["ready", "prepare"];
const AVAILABLE_FOOD_TYPES = ["snack", "leftover"];
const AVAILABLE_FOOD_FRESHNESS = ["today", "tomorrow", "later"];
const AVAILABLE_FOOD_USE_FOR = ["lunch", "snack", "nextDinner", "any"];

function cleanText(value, maxLength) {
  return `${value || ""}`.trim().slice(0, maxLength);
}

function cleanPhoto(value) {
  const photo = `${value || ""}`.trim();
  if (/^assets\/[\w.-]+\.jpe?g$/i.test(photo)) return photo;
  if (photo.startsWith("data:image/") && photo.length * 0.75 <= MAX_PHOTO_BYTES) return photo;
  return "";
}

function cleanMeal(value) {
  const source = value && typeof value === "object" ? value : {};
  const handoff = source.handoff && typeof source.handoff === "object" ? source.handoff : {};
  const dinner = cleanText(source.dinner || source.main, 120);
  return {
    breakfast: cleanText(source.breakfast, 120),
    lunch: cleanText(source.lunch, 120),
    dinner,
    // Keep the legacy field in sync so older clients continue to read dinner.
    main: dinner,
    side: cleanText(source.side, 120),
    salad: cleanText(source.salad, 120),
    notes: cleanLocalizedText(source.notes, 500),
    handoff: {
      leftovers: Boolean(handoff.leftovers),
      kidsSnack: Boolean(handoff.kidsSnack),
      flexible: Boolean(handoff.flexible),
      leftoverServings: LEFTOVER_SERVINGS.includes(handoff.leftoverServings) ? handoff.leftoverServings : "",
      leftoverUseFirst: LEFTOVER_USE_FIRST.includes(handoff.leftoverUseFirst) ? handoff.leftoverUseFirst : "",
      snackStatus: SNACK_STATUS.includes(handoff.snackStatus) ? handoff.snackStatus : "",
      snack: cleanLocalizedText(handoff.snack, 120),
    },
  };
}

function cleanSchedule(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(DAY_KEYS.map((day) => [day, cleanMeal(source[day]) ]));
}

function cleanCalendar(value) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .slice(0, MAX_CALENDAR_DAYS)
      .map(([date, meal]) => [date, cleanMeal(meal)])
  );
}

function cleanFavorites(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => cleanText(id, 120)).filter(Boolean))].slice(0, MAX_FAVORITES);
}

function cleanTask(task) {
  const text = cleanLocalizedText(task?.text, 220);
  if (!hasLocalizedContent(text)) return null;
  const assignee = TASK_ASSIGNEES.includes(task.assignee)
    ? task.assignee
    : "other";

  return {
    id: cleanText(task.id, 160) || `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    assignee,
    date: /^\d{4}-\d{2}-\d{2}$/.test(task.date) ? task.date : new Date().toISOString().slice(0, 10),
    completed: Boolean(task.completed),
    createdAt: task.createdAt || new Date().toISOString(),
  };
}

function cleanTasks(value) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanTask).filter(Boolean).slice(0, MAX_TASKS);
}

function cleanAvailableFoodItem(item) {
  const label = cleanLocalizedText(item?.label, 160);
  if (!hasLocalizedContent(label)) return null;
  if (!AVAILABLE_FOOD_TYPES.includes(item?.type) || !AVAILABLE_FOOD_FRESHNESS.includes(item?.freshness)) return null;

  return {
    id: cleanText(item.id, 160) || `available-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    type: item.type,
    freshness: item.freshness,
    useFor: AVAILABLE_FOOD_USE_FOR.includes(item?.useFor) ? item.useFor : "any",
    createdAt: cleanText(item.createdAt, 40),
    updatedAt: cleanText(item.updatedAt, 40),
  };
}

function cleanAvailableFood(value) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanAvailableFoodItem).filter(Boolean).slice(0, MAX_AVAILABLE_FOOD);
}

function cleanRecipeEdit(edit) {
  const name = cleanLocalizedText(edit?.name, 120);
  if (!hasLocalizedContent(name)) return null;
  const category = ["main", "side", "salad", "sauce", "dessert", "draft"].includes(edit.category)
    ? edit.category
    : "main";

  return {
    id: cleanText(edit.id, 160),
    name,
    category,
    ingredientsText: cleanLocalizedText(edit.ingredientsText, 12000),
    stepsText: cleanLocalizedText(edit.stepsText, 12000),
    allergyWarning: cleanLocalizedText(edit.allergyWarning, 600),
    notes: cleanLocalizedText(edit.notes, 2000),
    cardPhoto: cleanPhoto(edit.cardPhoto) || (/^assets\/[a-z0-9-]+\.jpg$/.test(edit.cardPhoto || "") ? edit.cardPhoto : ""),
    photos: Array.isArray(edit.photos)
      ? edit.photos.map(cleanPhoto).filter(Boolean).slice(0, 3)
      : [],
    updatedAt: edit.updatedAt || new Date().toISOString(),
  };
}

function cleanRecipeEdits(value) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_RECIPE_EDITS)
      .map(([id, edit]) => [cleanText(id, 160), cleanRecipeEdit({ ...edit, id })])
      .filter(([id, edit]) => id && edit)
  );
}

function cleanDeletedRecipeIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => cleanText(id, 160)).filter(Boolean))].slice(0, MAX_DELETED_RECIPES);
}

export function cleanState(value) {
  return {
    weekStart: /^\d{4}-\d{2}-\d{2}$/.test(value?.weekStart) ? value.weekStart : "",
    schedule: cleanSchedule(value?.schedule),
    calendarMeals: cleanCalendar(value?.calendarMeals),
    favorites: cleanFavorites(value?.favorites),
    tasks: cleanTasks(value?.tasks),
    availableFood: cleanAvailableFood(value?.availableFood),
    recipeFeedback: normalizeRecipeFeedback(value?.recipeFeedback),
    recipeEdits: cleanRecipeEdits(value?.recipeEdits),
    deletedRecipeIds: cleanDeletedRecipeIds(value?.deletedRecipeIds),
    updatedAt: new Date().toISOString(),
  };
}

function stateRecord(saved) {
  return versionedRecord(saved, "state");
}

export default async (request) => {
  const store = getStore(STORE_NAME);

  if (request.method === "GET") {
    return jsonResponse(stateRecord(await store.get(STATE_KEY, { type: "json" })));
  }

  if (request.method === "PUT") {
    const authError = requireWriteAuth(request);
    if (authError) return authError;

    const { payload, error } = await readJsonRequest(request, { maxBytes: MAX_REQUEST_BYTES });
    if (error) return error;

    const current = stateRecord(await store.get(STATE_KEY, { type: "json" }));
    if (hasVersionConflict(payload.version, current.version)) {
      return jsonResponse({
        error: "Family menu changed on another device. Refresh and try again.",
        state: current.state,
        version: current.version,
        updatedAt: current.updatedAt,
      }, 409);
    }

    const record = nextVersionedRecord("state", cleanState(payload.state), current.version);
    await store.setJSON(STATE_KEY, record);
    return jsonResponse(record);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};
