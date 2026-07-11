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

export const emptyMeal = { main: "", side: "", salad: "", notes: "" };

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
  if (!value) return { ...emptyMeal };
  if (typeof value === "string") return { ...emptyMeal, main: value };
  const normalized = { ...emptyMeal, ...value };
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
  return Boolean(meal.main || meal.side || meal.salad || hasLocalizedContent(meal.notes));
}

export function removeRecipeFromPlans(schedule, calendarMeals, recipeId, slotKeys = ["main", "side", "salad"]) {
  const clearMeal = (meal) => Object.fromEntries(
    Object.entries(normalizeMealPlan(meal)).map(([key, value]) =>
      slotKeys.includes(key) && value === recipeId ? [key, ""] : [key, value])
  );

  return {
    schedule: normalizeSchedule(Object.fromEntries(days.map((day) => [day.key, clearMeal(schedule?.[day.key])]))),
    calendarMeals: Object.fromEntries(
      Object.entries(calendarMeals || {}).map(([dateKey, meal]) => [dateKey, clearMeal(meal)])
    ),
  };
}
