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
  { key: "breakfast", label: "breakfastSlot" },
  { key: "lunch", label: "lunchSlot" },
  { key: "dinner", label: "dinnerSlot" },
];

export const mealRoles = [
  { key: "main", label: "roleMain" },
  { key: "side", label: "roleSide" },
  { key: "salad", label: "roleSalad" },
  { key: "dessert", label: "roleDessert" },
  { key: "sauce", label: "roleSauce" },
  { key: "drink", label: "roleDrink" },
  { key: "other", label: "roleOther" },
];

const mealPeriodKeys = new Set(mealPeriods.map(({ key }) => key));
const mealRoleKeys = new Set(mealRoles.map(({ key }) => key));

function legacyMealItems(value) {
  const dinner = typeof value?.dinner === "string" && value.dinner
    ? value.dinner
    : typeof value?.main === "string" ? value.main : "";
  return [
    ["breakfast", "main", value?.breakfast],
    ["lunch", "main", value?.lunch],
    ["lunch", "salad", value?.lunchSalad],
    ["dinner", "main", dinner],
    ["dinner", "side", value?.side],
    ["dinner", "salad", value?.salad],
  ].filter(([, , recipeId]) => typeof recipeId === "string" && recipeId)
    .map(([period, role, recipeId], index) => ({
      id: `legacy-${period}-${role}-${index}-${recipeId}`.slice(0, 160),
      period,
      role,
      sourceType: "recipe",
      recipeId,
    }));
}

export function normalizeMealItems(value) {
  const hasCanonicalItems = value?.mealItemsVersion === 1 && Array.isArray(value?.items);
  const source = hasCanonicalItems
    ? value.items
    : Array.isArray(value?.items) && value.items.length
      ? value.items
      : legacyMealItems(value);
  return source.map((item, index) => {
    if (!item || typeof item !== "object") return null;
    const recipeId = typeof item.recipeId === "string" ? item.recipeId.trim().slice(0, 120) : "";
    if (!recipeId) return null;
    const period = mealPeriodKeys.has(item.period) ? item.period : "dinner";
    const role = mealRoleKeys.has(item.role) ? item.role : "other";
    const id = typeof item.id === "string" && /^[a-z0-9-]{1,160}$/i.test(item.id)
      ? item.id
      : `meal-item-${index}-${recipeId}`.slice(0, 160);
    const leftoverSourceDate = typeof item.leftoverSourceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.leftoverSourceDate)
      ? item.leftoverSourceDate
      : "";
    const leftoverSourceItemId = typeof item.leftoverSourceItemId === "string" && /^[a-z0-9-]{1,160}$/i.test(item.leftoverSourceItemId)
      ? item.leftoverSourceItemId
      : "";
    const sourceType = item.sourceType === "leftover" && leftoverSourceDate && leftoverSourceItemId ? "leftover" : "recipe";
    return {
      id,
      period,
      role,
      sourceType,
      recipeId,
      ...(sourceType === "leftover" ? {
        leftoverSourceDate,
        leftoverSourceItemId,
        servings: boundedServings(item.servings),
      } : {}),
    };
  }).filter(Boolean).slice(0, 40);
}

function legacyFieldsFromItems(items) {
  const first = (period, role) => items.find((item) => item.period === period && (!role || item.role === role))?.recipeId || "";
  const dinner = first("dinner", "main");
  return {
    breakfast: first("breakfast"),
    lunch: first("lunch", "main") || first("lunch"),
    lunchSalad: first("lunch", "salad"),
    dinner,
    main: dinner,
    side: first("dinner", "side"),
    salad: first("dinner", "salad"),
  };
}

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
    .filter(([id]) => typeof id === "string" && /^[a-z0-9-]{1,160}$/i.test(id))
    .map(([id, servings]) => [id, boundedServings(servings)]));
  return {
    adults: boundedCount(source.adults, defaultServingPlan.adults),
    kids: boundedCount(source.kids, defaultServingPlan.kids),
    guests: boundedCount(source.guests, defaultServingPlan.guests),
    actualLeftovers,
  };
}

export function normalizeMealServingPlans(value) {
  const source = value && typeof value === "object" ? value : {};
  const legacy = normalizeServingPlan(source.servingPlan);
  return Object.fromEntries(mealPeriods.map(({ key }) => {
    const periodPlan = source.servingPlans?.[key];
    return [key, normalizeServingPlan(periodPlan || legacy)];
  }));
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
  mealItemsVersion: 1,
  items: [],
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
  servingPlans: Object.fromEntries(mealPeriods.map(({ key }) => [key, { ...defaultServingPlan, actualLeftovers: {} }])),
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
  mon: { ...emptyMeal, items: legacyMealItems({ main: "meatballs", side: "zaatar-parmesan-potatoes" }) },
  tue: { ...emptyMeal, items: legacyMealItems({ main: "chicken-milanese", salad: "strawberry-crunch-salad" }) },
  wed: { ...emptyMeal, items: legacyMealItems({ main: "lemon-chicken", side: "zaatar-parmesan-potatoes" }) },
  thu: { ...emptyMeal, items: legacyMealItems({ main: "halibut-summer-vegetables" }) },
  fri: { ...emptyMeal, items: legacyMealItems({ main: "pasta-with-meat-sauce", salad: "roasted-brussels-sprouts-salad" }) },
  sat: { ...emptyMeal },
  sun: { ...emptyMeal },
};

export function normalizeMealPlan(value) {
  if (!value) return {
    ...emptyMeal,
    handoff: { ...emptyHandoff },
    servingPlan: normalizeServingPlan(),
    servingPlans: normalizeMealServingPlans(),
  };
  if (typeof value === "string") return normalizeMealPlan({ dinner: value });
  const items = normalizeMealItems(value);
  const legacyFields = legacyFieldsFromItems(items);
  const servingPlans = normalizeMealServingPlans(value);
  const servingPlan = {
    ...servingPlans.dinner,
    actualLeftovers: normalizeServingPlan(value.servingPlan).actualLeftovers,
  };
  const normalized = {
    ...emptyMeal,
    ...value,
    ...legacyFields,
    mealItemsVersion: 1,
    items,
    handoff: normalizeHandoff(value.handoff),
    servingPlan,
    servingPlans,
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
    meal.items?.length
    || meal.breakfast
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

    nextCalendarMeals[targetDateKey] = {
      ...sourceMeal,
      items: sourceMeal.items.filter((item) => item.sourceType !== "leftover").map((item) => ({ ...item })),
      handoff: { ...sourceMeal.handoff },
      servingPlan: {
        ...sourceMeal.servingPlan,
        actualLeftovers: {},
      },
      servingPlans: Object.fromEntries(Object.entries(sourceMeal.servingPlans)
        .map(([period, plan]) => [period, { ...plan, actualLeftovers: { ...plan.actualLeftovers } }])),
    };
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
    const removedItemIds = normalized.items.filter((item) => item.recipeId === recipeId).map((item) => item.id);
    next.items = normalized.items.filter((item) => item.recipeId !== recipeId);
    slotKeys.forEach((slotKey) => {
      if (next[slotKey] !== recipeId) return;
      next[slotKey] = "";
      if (slotKey === "main" || slotKey === "dinner") {
        next.main = "";
        next.dinner = "";
      }
    });
    if (Object.prototype.hasOwnProperty.call(next.servingPlan.actualLeftovers, recipeId) || removedItemIds.length) {
      const actualLeftovers = { ...next.servingPlan.actualLeftovers };
      delete actualLeftovers[recipeId];
      removedItemIds.forEach((itemId) => delete actualLeftovers[itemId]);
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
