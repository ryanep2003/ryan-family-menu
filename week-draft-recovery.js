import { activeWeekDateKeys, normalizeCalendar, normalizeMealPlan, normalizeSchedule } from "./schedule-utils.js";

export const WEEK_DRAFT_RECOVERY_KEY = "dinner-week-draft-v1";
const MAX_RECOVERY_LENGTH = 65536;

function fingerprint(value) {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${source.length}:${(hash >>> 0).toString(16)}`;
}

function planningFingerprint(input) {
  return fingerprint({
    recipes: [...(input.recipes || [])].sort((a, b) => `${a.id}`.localeCompare(`${b.id}`)).map((recipe) => ({
      id: recipe.id, name: recipe.name, category: recipe.category, ingredients: recipe.ingredients,
      meta: recipe.meta, short: recipe.short, tags: recipe.tags, servings: recipe.servings,
      allergyWarning: recipe.allergyWarning,
    })),
    members: input.members,
    preferences: input.preferences,
    rules: input.rules,
    events: input.events,
    favorites: [...(input.favorites || [])].sort(),
    inventory: input.inventory,
  });
}

function effectiveMeals(input) {
  const schedule = normalizeSchedule(input.schedule);
  const calendar = normalizeCalendar(input.calendarMeals);
  return Object.fromEntries(activeWeekDateKeys(input.weekStartKey).map(({ key, dateKey }) => [
    dateKey, normalizeMealPlan(Object.hasOwn(calendar, dateKey) ? calendar[dateKey] : schedule[key]),
  ]));
}

export function serializeWeekDraftRecovery({ draft, selectedDateKeys, input }) {
  const record = {
    schemaVersion: 1,
    context: planningFingerprint(input),
    draft,
    selectedDateKeys: [...new Set(selectedDateKeys)],
  };
  const raw = JSON.stringify(record);
  return raw.length <= MAX_RECOVERY_LENGTH ? raw : null;
}

export function recoverWeekDraft(raw, input) {
  if (raw === null) return { status: "empty" };
  if (typeof raw !== "string" || raw.length > MAX_RECOVERY_LENGTH) return { status: "stale" };
  let record;
  try { record = JSON.parse(raw); }
  catch { return { status: "stale" }; }
  const draft = record?.draft;
  const dates = activeWeekDateKeys(input.weekStartKey).map(({ dateKey }) => dateKey);
  if (record?.schemaVersion !== 1 || draft?.schemaVersion !== 1
    || draft.weekStartKey !== input.weekStartKey
    || !Number.isSafeInteger(draft.base?.scheduleVersion)
    || draft.base.scheduleVersion !== input.scheduleVersion
    || record.context !== planningFingerprint(input)
    || !Array.isArray(draft.days) || draft.days.length !== 7
    || draft.days.some((day, index) => day?.dateKey !== dates[index]
      || !["kept", "suggested", "unresolved"].includes(day.status)
      || typeof day.recipeId !== "string" || day.recipeId.length > 160)
    || !Array.isArray(record.selectedDateKeys) || record.selectedDateKeys.length > 7
    || record.selectedDateKeys.some((dateKey) => {
      const day = draft.days.find((entry) => entry.dateKey === dateKey);
      return !day?.recipeId || day.status === "unresolved"
        || Boolean(draft.base.effectiveMealsByDate?.[dateKey]?.dinner);
    })
    || JSON.stringify(draft.base.effectiveMealsByDate) !== JSON.stringify(effectiveMeals(input))) {
    return { status: "stale" };
  }
  const catalogIds = new Set((input.recipes || []).map((recipe) => recipe.id));
  const currentMeals = effectiveMeals(input);
  if (draft.days.some((day) => day.recipeId && !catalogIds.has(day.recipeId)
    && !Object.values(currentMeals).some((meal) => meal.items.some((item) => item.recipeId === day.recipeId)))) {
    return { status: "stale" };
  }
  return { status: "restored", draft, selectedDateKeys: [...new Set(record.selectedDateKeys)] };
}
