import { activeWeekDateKeys, normalizeCalendar, normalizeMealPlan, normalizeSchedule, normalizeServingPlan } from "./schedule-utils.js";

function sameMeal(left, right) {
  return JSON.stringify(normalizeMealPlan(left)) === JSON.stringify(normalizeMealPlan(right));
}

function dinnerMain(meal) {
  return normalizeMealPlan(meal).items.find((item) => item.period === "dinner" && item.role === "main")?.recipeId || "";
}

function effectiveMeal(schedule, calendarMeals, day) {
  return Object.hasOwn(calendarMeals, day.dateKey)
    ? normalizeMealPlan(calendarMeals[day.dateKey])
    : normalizeMealPlan(schedule[day.key]);
}

/** Prepare a conflict-checked schedule write; this function never saves or mutates state. */
export function prepareWeekDraftApproval({ draft, approvedDateKeys = [], visibleRecipeIds = [], latestRecord } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft?.weekStartKey || "")) {
    return { status: "invalid", reason: "invalid-week", conflicts: [], appliedDates: [] };
  }
  const weekDates = activeWeekDateKeys(draft?.weekStartKey);
  const dateMap = new Map(weekDates.map((day) => [day.dateKey, day]));
  const draftDays = new Map((Array.isArray(draft?.days) ? draft.days : []).map((day) => [day.dateKey, day]));
  const allowedIds = new Set(visibleRecipeIds);
  const latestVersion = Number(latestRecord?.version);
  if (!Number.isSafeInteger(latestVersion) || latestVersion < 0
    || !latestRecord?.schedule || !latestRecord?.calendarMeals
    || !Number.isSafeInteger(Number(draft?.base?.scheduleVersion))
    || !draft?.base?.effectiveMealsByDate) {
    return { status: "invalid", reason: "missing-version-or-baseline", conflicts: [], appliedDates: [] };
  }
  if (latestRecord.weekStartKey && latestRecord.weekStartKey !== draft.weekStartKey) {
    return { status: "conflict", reason: "active-week-changed", conflicts: [], appliedDates: [] };
  }
  if (!Array.isArray(approvedDateKeys) || approvedDateKeys.length > 7
    || approvedDateKeys.some((dateKey) => !dateMap.has(dateKey))) {
    return { status: "invalid", reason: "invalid-dates", conflicts: [], appliedDates: [] };
  }
  const latestSchedule = normalizeSchedule(latestRecord.schedule);
  const latestCalendar = normalizeCalendar(latestRecord.calendarMeals);
  const conflicts = [];
  const changes = [];
  for (const dateKey of new Set(approvedDateKeys)) {
    const day = dateMap.get(dateKey);
    const choice = draftDays.get(dateKey);
    const base = draft.base.effectiveMealsByDate[dateKey];
    const current = effectiveMeal(latestSchedule, latestCalendar, day);
    if (!base || !choice || choice.dateKey !== dateKey || choice.needsRestrictionReview
      || !choice.recipeId || !allowedIds.has(choice.recipeId)
      || !["suggested", "kept"].includes(choice.status)) {
      return { status: "invalid", reason: "unreviewed-or-unknown-choice", conflicts: [], appliedDates: [] };
    }
    const baseDinner = dinnerMain(base);
    if (baseDinner) {
      if (baseDinner !== choice.recipeId) {
        return { status: "invalid", reason: "existing-dinner-replacement", conflicts: [], appliedDates: [] };
      }
      continue;
    }
    if (!sameMeal(base, current)) {
      conflicts.push(dateKey);
      continue;
    }
    if (dinnerMain(current)) {
      conflicts.push(dateKey);
      continue;
    }
    const items = current.items.filter((item) => !(item.period === "dinner" && item.role === "main"));
    const servingPlan = normalizeServingPlan(choice.servingPlan);
    changes.push([dateKey, normalizeMealPlan({
      ...current,
      mealItemsVersion: 1,
      items: [...items, { id: "draft-dinner-main", period: "dinner", role: "main", sourceType: "recipe", recipeId: choice.recipeId }],
      servingPlan,
      servingPlans: { ...current.servingPlans, dinner: servingPlan },
    })]);
  }
  if (conflicts.length) return { status: "conflict", conflicts, appliedDates: [] };
  if (!changes.length) return { status: "no-change", conflicts: [], appliedDates: [] };
  return {
    status: "ready", conflicts: [], appliedDates: changes.map(([dateKey]) => dateKey),
    record: {
      schedule: latestSchedule,
      calendarMeals: { ...latestCalendar, ...Object.fromEntries(changes) },
      weekStartKey: latestRecord.weekStartKey || draft.weekStartKey,
      version: latestVersion,
    },
  };
}
