import { hasLocalizedContent, isLocalizedValue } from "./localized-data.js";

export const days = [
  { key: "mon", en: "Monday", es: "Lunes" },
  { key: "tue", en: "Tuesday", es: "Martes" },
  { key: "wed", en: "Wednesday", es: "Miércoles" },
  { key: "thu", en: "Thursday", es: "Jueves" },
  { key: "fri", en: "Friday", es: "Viernes" },
  { key: "sat", en: "Saturday", es: "Sábado" },
  { key: "sun", en: "Sunday", es: "Domingo" },
];

export const handoffOptions = [
  { key: "leftovers", label: "leftoversPlanned", tone: "gold" },
  { key: "kidsSnack", label: "kidsSnack", tone: "sage" },
  { key: "flexible", label: "flexibleMeal", tone: "tomato" },
];

export const leftoverServingOptions = [
  { key: "one", label: "leftoverServingsOne" },
  { key: "two", label: "leftoverServingsTwo" },
  { key: "threePlus", label: "leftoverServingsThreePlus" },
];

export const leftoverUseOptions = [
  { key: "lunch", label: "leftoverUseLunch" },
  { key: "snack", label: "leftoverUseSnack" },
  { key: "nextDinner", label: "leftoverUseNextDinner" },
  { key: "any", label: "leftoverUseAny" },
];

export const snackStatusOptions = [
  { key: "ready", label: "snackReady" },
  { key: "prepare", label: "snackNeedsPrep" },
];

const mealRecipeCategories = ["main", "side", "salad", "sauce", "dessert", "draft"];

export const mealPeriods = [
  { key: "breakfast", label: "breakfastSlot", choose: "chooseBreakfast", categories: mealRecipeCategories },
  { key: "lunch", label: "lunchMainSlot", choose: "chooseLunchMain", categories: mealRecipeCategories },
  { key: "lunchSalad", label: "lunchSaladSlot", choose: "chooseLunchSalad", categories: ["salad"] },
  { key: "dinner", label: "dinnerSlot", choose: "chooseDinner", categories: mealRecipeCategories },
];

export const emptyHandoff = {
  leftovers: false,
  kidsSnack: false,
  flexible: false,
  leftoverServings: "",
  leftoverUseFirst: "",
  snackStatus: "",
  snack: "",
};

export const defaultServingPlan = {
  adults: 2,
  kids: 2,
  guests: 0,
  actualLeftovers: {},
};

function boundedCount(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(20, Math.max(0, Math.round(number))) : fallback;
}

function boundedServings(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number * 2) / 2)) : fallback;
}

export function normalizeServingPlan(value) {
  const source = value && typeof value === "object" ? value : {};
  const actualLeftovers = Object.fromEntries(Object.entries(source.actualLeftovers || {})
    .filter(([id]) => typeof id === "string" && /^[a-z0-9-]{1,120}$/i.test(id))
    .map(([id, servings]) => [id, boundedServings(servings)]));
  return {
    adults: boundedCount(source.adults, defaultServingPlan.adults),
    kids: boundedCount(source.kids, defaultServingPlan.kids),
    guests: boundedCount(source.guests, defaultServingPlan.guests),
    actualLeftovers,
  };
}

export function plannedServings(value) {
  const plan = normalizeServingPlan(value);
  return plan.adults + (plan.kids * 0.5) + plan.guests;
}

export function recipeBatchPlan(recipeServings, neededServings) {
  const recipeYield = Number(recipeServings);
  const needed = Number(neededServings);
  if (!(recipeYield > 0) || !(needed > 0)) return null;
  const batches = Math.ceil((needed / recipeYield) * 4) / 4;
  const cookedServings = batches * recipeYield;
  return {
    batches,
    cookedServings,
    expectedLeftovers: Math.max(0, Math.round((cookedServings - needed) * 4) / 4),
  };
}

export const emptyMeal = {
  breakfast: "",
  lunch: "",
  lunchSalad: "",
  dinner: "",
  // Keep main as a storage-compatible alias for the original dinner slot.
  main: "",
  side: "",
  salad: "",
  notes: "",
  handoff: { ...emptyHandoff },
  servingPlan: { ...defaultServingPlan, actualLeftovers: {} },
};

function allowedValue(value, options) {
  return options.some((option) => option.key === value) ? value : "";
}

export function normalizeHandoff(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    leftovers: Boolean(source.leftovers),
    kidsSnack: Boolean(source.kidsSnack),
    flexible: Boolean(source.flexible),
    leftoverServings: allowedValue(source.leftoverServings, leftoverServingOptions),
    leftoverUseFirst: allowedValue(source.leftoverUseFirst, leftoverUseOptions),
    snackStatus: allowedValue(source.snackStatus, snackStatusOptions),
    snack: typeof source.snack === "string" || isLocalizedValue(source.snack) ? source.snack : "",
  };
}

const defaultSchedule = {
  mon: { ...emptyMeal, main: "meatballs", side: "zaatar-parmesan-potatoes" },
  tue: { ...emptyMeal, main: "chicken-milanese", salad: "strawberry-crunch-salad" },
  wed: { ...emptyMeal, main: "lemon-chicken", side: "zaatar-parmesan-potatoes" },
  thu: { ...emptyMeal, main: "halibut-summer-vegetables" },
  fri: { ...emptyMeal, main: "pasta-with-meat-sauce", salad: "roasted-brussels-sprouts-salad" },
  sat: { ...emptyMeal },
  sun: { ...emptyMeal },
};

export function normalizeMealPlan(value) {
  if (!value) return { ...emptyMeal, handoff: { ...emptyHandoff }, servingPlan: normalizeServingPlan() };
  if (typeof value === "string") return { ...emptyMeal, handoff: { ...emptyHandoff }, servingPlan: normalizeServingPlan(), dinner: value, main: value };
  const dinner = typeof value.dinner === "string" && value.dinner
    ? value.dinner
    : typeof value.main === "string" ? value.main : "";
  const normalized = {
    ...emptyMeal,
    ...value,
    breakfast: typeof value.breakfast === "string" ? value.breakfast : "",
    lunch: typeof value.lunch === "string" ? value.lunch : "",
    lunchSalad: typeof value.lunchSalad === "string" ? value.lunchSalad : "",
    dinner,
    main: dinner,
    handoff: normalizeHandoff(value.handoff),
    servingPlan: normalizeServingPlan(value.servingPlan),
  };
  if (typeof normalized.notes !== "string" && !isLocalizedValue(normalized.notes)) {
    normalized.notes = "";
  }
  return normalized;
}

export function normalizeSchedule(raw) {
  const source = raw || defaultSchedule;
  return days.reduce((result, day) => {
    result[day.key] = normalizeMealPlan(source[day.key]);
    return result;
  }, {});
}

export function normalizeCalendar(raw) {
  return Object.fromEntries(
    Object.entries(raw || {}).map(([dateKey, value]) => [dateKey, normalizeMealPlan(value)])
  );
}

export function formatDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function currentWeekStartKey(date = new Date()) {
  const start = new Date(date);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return formatDateKey(start);
}

export function dateFromKey(dateKey) {
  return new Date(`${dateKey}T12:00:00`);
}

export function activeWeekDateKeys(weekStartKey) {
  const start = dateFromKey(weekStartKey);
  return days.map((day, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { ...day, date, dateKey: formatDateKey(date) };
  });
}

export function mealHasContent(meal) {
  return Boolean(
    meal.breakfast
    || meal.lunch
    || meal.lunchSalad
    || meal.dinner
    || meal.main
    || meal.side
    || meal.salad
    || hasLocalizedContent(meal.notes)
    || Object.values(meal.handoff || {}).some(Boolean)
  );
}

export function copyCurrentWeekToNextWeek(weekStartKey, schedule, calendarMeals) {
  const normalizedSchedule = normalizeSchedule(schedule);
  const normalizedCalendar = normalizeCalendar(calendarMeals);
  const sourceWeek = activeWeekDateKeys(weekStartKey);
  const nextWeekStart = dateFromKey(weekStartKey);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const targetWeek = activeWeekDateKeys(formatDateKey(nextWeekStart));
  const nextCalendarMeals = { ...normalizedCalendar };
  let copiedCount = 0;
  let skippedCount = 0;

  sourceWeek.forEach((day, index) => {
    const sourceMeal = Object.prototype.hasOwnProperty.call(normalizedCalendar, day.dateKey)
      ? normalizeMealPlan(normalizedCalendar[day.dateKey])
      : normalizeMealPlan(normalizedSchedule[day.key]);
    if (!mealHasContent(sourceMeal)) return;

    const targetDateKey = targetWeek[index].dateKey;
    const targetMeal = Object.prototype.hasOwnProperty.call(normalizedCalendar, targetDateKey)
      ? normalizeMealPlan(normalizedCalendar[targetDateKey])
      : { ...emptyMeal };
    if (mealHasContent(targetMeal)) {
      skippedCount += 1;
      return;
    }

    nextCalendarMeals[targetDateKey] = { ...sourceMeal };
    copiedCount += 1;
  });

  return { calendarMeals: nextCalendarMeals, copiedCount, skippedCount };
}

export function removeRecipeFromPlans(
  schedule,
  calendarMeals,
  recipeId,
  slotKeys = ["breakfast", "lunch", "lunchSalad", "dinner", "main", "side", "salad"],
) {
  const clearMeal = (meal) => {
    const normalized = normalizeMealPlan(meal);
    const next = { ...normalized };
    slotKeys.forEach((slotKey) => {
      if (next[slotKey] !== recipeId) return;
      next[slotKey] = "";
      if (slotKey === "main" || slotKey === "dinner") {
        next.main = "";
        next.dinner = "";
      }
    });
    if (Object.prototype.hasOwnProperty.call(next.servingPlan.actualLeftovers, recipeId)) {
      const actualLeftovers = { ...next.servingPlan.actualLeftovers };
      delete actualLeftovers[recipeId];
      next.servingPlan = { ...next.servingPlan, actualLeftovers };
    }
    return normalizeMealPlan(next);
  };

  return {
    schedule: normalizeSchedule(Object.fromEntries(days.map((day) => [day.key, clearMeal(schedule?.[day.key])]))),
    calendarMeals: Object.fromEntries(
      Object.entries(calendarMeals || {}).map(([dateKey, meal]) => [dateKey, clearMeal(meal)])
    ),
  };
}
