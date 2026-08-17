import { getStore } from "@netlify/blobs";
import { householdDataKey, requireHouseholdAccess } from "./_household.js";
import { jsonResponse, readJsonRequest } from "./_http.js";
import { hasVersionConflict, nextVersionedRecord, versionedRecord } from "./_versioned-record.js";
import { cleanLocalizedText, hasLocalizedContent } from "../../localized-data.js";
import { normalizeRecipeFeedback } from "../../family-state.js";
import { auditEvent, hasPlannedMeals, normalizeAuditEvents, normalizeStateSnapshots, stateSnapshot } from "../../audit-logic.js";
import { normalizeDinnerPace, normalizeFamilyMembers, normalizeFamilyPreferences, normalizeFamilyRules } from "../../memory-logic.js";

const STORE_NAME = "family-menu-state";
const AUDIT_STORE_NAME = "family-menu-audit";
const STATE_KEY = "shared-state";
const AUDIT_KEY = "history";
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MEAL_KEYS = ["breakfast", "lunch", "lunchSalad", "dinner", "main", "side", "salad", "notes"];
const MAX_CALENDAR_DAYS = 730;
const MAX_FAVORITES = 100;
const MAX_TASKS = 300;
const MAX_RECIPE_EDITS = 300;
const MAX_DELETED_RECIPES = 300;
const MAX_AVAILABLE_FOOD = 100;
const MAX_RECEIPTS = 500;
const MAX_ACTIVITY = 200;
const MAX_PHOTO_BYTES = 500000;
const MAX_REQUEST_BYTES = 3000000;
const TASK_ASSIGNEES = ["alyson", "eric", "nelly", "theo", "pierce", "other"];
const LEFTOVER_SERVINGS = ["one", "two", "threePlus"];
const LEFTOVER_USE_FIRST = ["lunch", "snack", "nextDinner", "any"];
const SNACK_STATUS = ["ready", "prepare"];
const AVAILABLE_FOOD_TYPES = ["snack", "leftover"];
const AVAILABLE_FOOD_FRESHNESS = ["today", "tomorrow", "later"];
const AVAILABLE_FOOD_USE_FOR = ["lunch", "snack", "nextDinner", "any"];
const MEAL_PERIODS = ["breakfast", "lunch", "dinner"];
const MEAL_ROLES = ["main", "side", "salad", "dessert", "sauce", "drink", "other"];

function cleanText(value, maxLength) {
  return `${value || ""}`.trim().slice(0, maxLength);
}

function auditRecord(value) {
  return {
    events: normalizeAuditEvents(value?.events),
    snapshots: normalizeStateSnapshots(value?.snapshots),
    version: Number(value?.version) || 0,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : "",
  };
}

function cleanPhoto(value) {
  const photo = `${value || ""}`.trim();
  if (/^assets\/[\w.-]+\.(?:jpe?g|webp)$/i.test(photo)) return photo;
  if (photo.startsWith("data:image/") && photo.length * 0.75 <= MAX_PHOTO_BYTES) return photo;
  return "";
}

function cleanMeal(value) {
  const source = value && typeof value === "object" ? value : {};
  const handoff = source.handoff && typeof source.handoff === "object" ? source.handoff : {};
  const legacyDinner = cleanText(source.dinner || source.main, 120);
  const legacyItems = [
    ["breakfast", "main", source.breakfast],
    ["lunch", "main", source.lunch],
    ["lunch", "salad", source.lunchSalad],
    ["dinner", "main", legacyDinner],
    ["dinner", "side", source.side],
    ["dinner", "salad", source.salad],
  ].filter(([, , recipeId]) => cleanText(recipeId, 120))
    .map(([period, role, recipeId], index) => ({
      id: `legacy-${period}-${role}-${index}-${cleanText(recipeId, 120)}`.slice(0, 160),
      period,
      role,
      sourceType: "recipe",
      recipeId: cleanText(recipeId, 120),
    }));
  const hasCanonicalItems = source.mealItemsVersion === 1 && Array.isArray(source.items);
  const rawItems = hasCanonicalItems
    ? source.items
    : Array.isArray(source.items) && source.items.length
      ? source.items
      : legacyItems;
  const items = rawItems.map((item, index) => {
    const recipeId = cleanText(item?.recipeId, 120);
    if (!recipeId) return null;
    const leftoverSourceDate = /^\d{4}-\d{2}-\d{2}$/.test(item?.leftoverSourceDate) ? item.leftoverSourceDate : "";
    const leftoverSourceItemId = /^[a-z0-9-]{1,160}$/i.test(item?.leftoverSourceItemId) ? item.leftoverSourceItemId : "";
    const sourceType = item?.sourceType === "leftover" && leftoverSourceDate && leftoverSourceItemId ? "leftover" : "recipe";
    return {
      id: /^[a-z0-9-]{1,160}$/i.test(item?.id) ? item.id : `meal-item-${index}-${recipeId}`.slice(0, 160),
      period: MEAL_PERIODS.includes(item?.period) ? item.period : "dinner",
      role: MEAL_ROLES.includes(item?.role) ? item.role : "other",
      sourceType,
      recipeId,
      ...(sourceType === "leftover" ? {
        leftoverSourceDate,
        leftoverSourceItemId,
        servings: Math.min(100, Math.max(0, Math.round(Number(item?.servings || 0) * 2) / 2)),
      } : {}),
    };
  }).filter(Boolean).slice(0, 40);
  const firstRecipe = (period, role) => items.find((item) => item.period === period && (!role || item.role === role))?.recipeId || "";
  const dinner = firstRecipe("dinner", "main");
  const servingPlan = source.servingPlan && typeof source.servingPlan === "object" ? source.servingPlan : {};
  const cleanCount = (entry, fallback) => Number.isFinite(Number(entry))
    ? Math.min(20, Math.max(0, Math.round(Number(entry))))
    : fallback;
  const actualLeftovers = Object.fromEntries(Object.entries(servingPlan.actualLeftovers || {})
    .filter(([id]) => /^[a-z0-9-]{1,160}$/i.test(id))
    .slice(0, 40)
    .map(([id, amount]) => [id, Math.min(100, Math.max(0, Math.round(Number(amount || 0) * 2) / 2))]));
  const cleanServingPlan = (plan = servingPlan) => ({
    adults: cleanCount(plan?.adults, 2),
    kids: cleanCount(plan?.kids, 2),
    guests: cleanCount(plan?.guests, 0),
    extraServings: Number.isFinite(Number(plan?.extraServings))
      ? Math.min(100, Math.max(0, Math.round(Number(plan.extraServings) * 2) / 2))
      : 0,
  });
  return {
    mealItemsVersion: 1,
    items,
    breakfast: firstRecipe("breakfast"),
    lunch: firstRecipe("lunch", "main") || firstRecipe("lunch"),
    lunchSalad: firstRecipe("lunch", "salad"),
    dinner,
    // Keep the legacy field in sync so older clients continue to read dinner.
    main: dinner,
    side: firstRecipe("dinner", "side"),
    salad: firstRecipe("dinner", "salad"),
    dinnerPace: normalizeDinnerPace(source.dinnerPace),
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
    servingPlan: {
      ...cleanServingPlan(),
      actualLeftovers,
    },
    servingPlans: Object.fromEntries(MEAL_PERIODS.map((period) => [
      period,
      cleanServingPlan(source.servingPlans?.[period]),
    ])),
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

function cleanBudgetSettings(value) {
  const target = Number(value?.monthlyTarget);
  return { monthlyTarget: Number.isFinite(target) ? Math.min(100000, Math.max(0, Math.round(target * 100) / 100)) : 0 };
}

function cleanReceipt(item) {
  const total = Math.min(100000, Math.max(0, Math.round(Number(item?.total || 0) * 100) / 100));
  const itemCount = Math.min(500, Math.max(0, Math.round(Number(item?.itemCount) || 0)));
  const store = cleanText(item.store, 120) || "Store";
  if (!(total > 0) && itemCount < 1 && store === "Store") return null;
  return {
    id: cleanText(item.id, 160) || `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : new Date().toISOString().slice(0, 10),
    store,
    subtotal: Math.min(100000, Math.max(0, Math.round(Number(item.subtotal || 0) * 100) / 100)),
    tax: Math.min(100000, Math.max(0, Math.round(Number(item.tax || 0) * 100) / 100)),
    total,
    totalEstimated: item?.totalEstimated === true,
    itemCount,
    createdAt: cleanText(item.createdAt, 40),
    updatedBy: cleanText(item.updatedBy, 80),
  };
}

function cleanReceipts(value) {
  return Array.isArray(value) ? value.map(cleanReceipt).filter(Boolean).slice(0, MAX_RECEIPTS) : [];
}

function cleanActivity(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => ({
    id: cleanText(entry?.id, 160),
    type: ["meal", "grocery", "inventory", "receipt", "budget", "recipe"].includes(entry?.type) ? entry.type : "meal",
    label: cleanText(entry?.label, 220),
    updatedBy: cleanText(entry?.updatedBy, 80) || "Family",
    updatedAt: cleanText(entry?.updatedAt, 40),
  })).filter((entry) => entry.id && entry.label && !Number.isNaN(new Date(entry.updatedAt).getTime())).slice(0, MAX_ACTIVITY);
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
    servings: Number.isFinite(Number(edit.servings)) && Number(edit.servings) > 0
      ? Math.min(100, Math.round(Number(edit.servings) * 2) / 2)
      : 0,
    ingredientsText: cleanLocalizedText(edit.ingredientsText, 12000),
    stepsText: cleanLocalizedText(edit.stepsText, 12000),
    allergyWarning: cleanLocalizedText(edit.allergyWarning, 600),
    notes: cleanLocalizedText(edit.notes, 2000),
    cardPhoto: cleanPhoto(edit.cardPhoto),
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
    budgetSettings: cleanBudgetSettings(value?.budgetSettings),
    receipts: cleanReceipts(value?.receipts),
    activity: cleanActivity(value?.activity),
    familyMembers: normalizeFamilyMembers(value?.familyMembers),
    familyPreferences: normalizeFamilyPreferences(value?.familyPreferences, value?.familyMembers),
    familyRules: normalizeFamilyRules(value?.familyRules),
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
  const access = await requireHouseholdAccess(request);
  if (access.error) return access.error;
  const stateKey = householdDataKey(access.household.id, STATE_KEY);

  if (request.method === "GET") {
    return jsonResponse(stateRecord(await store.get(stateKey, { type: "json" })));
  }

  if (request.method === "PUT") {
    const { payload, error } = await readJsonRequest(request, { maxBytes: MAX_REQUEST_BYTES });
    if (error) return error;

    const current = stateRecord(await store.get(stateKey, { type: "json" }));
    if (hasVersionConflict(payload.version, current.version)) {
      return jsonResponse({
        error: "Family menu changed on another device. Refresh and try again.",
        state: current.state,
        version: current.version,
        updatedAt: current.updatedAt,
      }, 409);
    }

    const nextState = cleanState(payload.state);
    if (hasPlannedMeals(current.state) && !hasPlannedMeals(nextState) && payload.allowEmptySchedule !== true) {
      return jsonResponse({
        error: "This change would remove every planned meal. Confirm Clear week before replacing the shared menu.",
        code: "empty-overwrite-blocked",
        state: current.state,
        version: current.version,
        updatedAt: current.updatedAt,
      }, 409);
    }
    const nextVersion = current.version + 1;
    const record = nextVersionedRecord("state", nextState, current.version);
    try {
      const auditStore = getStore(AUDIT_STORE_NAME);
      const auditKey = householdDataKey(access.household.id, AUDIT_KEY);
      const previousAudit = auditRecord(await auditStore.get(auditKey, { type: "json" }));
      const updatedAt = record.updatedAt;
      const actor = cleanText(payload.actor, 80) || "Family";
      const event = auditEvent({
        action: cleanText(payload.auditAction, 80) || (payload.allowEmptySchedule ? "clear-week" : "state-updated"),
        actor,
        updatedAt,
        version: nextVersion,
        before: current.state || {},
        after: nextState,
      });
      const snapshot = current.state
        ? stateSnapshot({ state: current.state, actor, version: current.version, updatedAt: current.updatedAt || updatedAt })
        : null;
      await auditStore.setJSON(auditKey, {
        events: [event, ...previousAudit.events],
        snapshots: snapshot ? [snapshot, ...previousAudit.snapshots] : previousAudit.snapshots,
        version: previousAudit.version + 1,
        updatedAt,
      });
    } catch (auditError) {
      console.warn("Could not write household audit history", auditError);
    }
    await store.setJSON(stateKey, record);
    return jsonResponse(record);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};
