import assert from "node:assert/strict";
import test from "node:test";

import { createScheduleUi } from "../schedule-ui.js";
import { days, emptyMeal, formatDateKey, handoffOptions } from "../schedule-utils.js";

function element(initial = {}) {
  const listeners = new Map();
  return {
    hidden: false,
    innerHTML: "",
    textContent: "",
    dataset: {},
    value: "",
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    async dispatch(type) {
      await listeners.get(type)?.();
    },
    scrollIntoView() {
      this.scrolled = true;
    },
    focus() {
      this.focused = true;
    },
    ...initial,
  };
}

function escapeHtml(value) {
  return `${value || ""}`.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[character]));
}

function weekDates() {
  const start = new Date("2026-06-22T12:00:00");
  return days.map((day, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { ...day, date, dateKey: formatDateKey(date) };
  });
}

function calendarDates() {
  const start = new Date("2026-06-01T12:00:00");
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return formatDateKey(date);
  });
}

function harness() {
  const elements = {
    "#scheduleGrid": element(),
    "#weekDateEditor": element(),
    "#weekEditorHeading": element(),
    "#weekTitle": element(),
    "#monthTitle": element(),
    "#calendarWeekdays": element(),
    "#calendarGrid": element(),
    "#calendarDateEditor": element({ hidden: true }),
  };
  const weekButtons = weekDates().map(({ dateKey }) => element({ dataset: { editWeekDate: dateKey } }));
  const dateButtons = calendarDates().map((dateKey) => element({ dataset: { editCalendarDate: dateKey } }));
  const calendarControl = element({
    dataset: { mealContext: "calendar:2026-06-24", slot: "main" },
    value: "main-recipe",
  });
  const recipes = [
    { id: "main-recipe", name: "Main Recipe", category: "main" },
    { id: "side-recipe", name: "Side Recipe", category: "side" },
    { id: "salad-recipe", name: "Salad Recipe", category: "salad" },
  ];
  const state = {
    schedule: Object.fromEntries(days.map((day) => [day.key, { ...emptyMeal }])),
    calendarMeals: {},
    saveCalls: 0,
  };
  state.schedule.mon.main = "main-recipe";

  const activeWeekDateKeys = () => weekDates();
  const calendarMealForDateKey = (dateKey) => {
    if (state.calendarMeals[dateKey]) return { ...emptyMeal, ...state.calendarMeals[dateKey] };
    const weekDate = weekDates().find((day) => day.dateKey === dateKey);
    return weekDate ? { ...emptyMeal, ...state.schedule[weekDate.key] } : { ...emptyMeal };
  };
  const mealRecipes = (meal) => ["main", "side", "salad"]
    .map((key) => ({ key, recipe: recipes.find((recipe) => recipe.id === meal[key]) }))
    .filter(({ recipe }) => recipe);

  const ui = createScheduleUi({
    $: (selector) => elements[selector],
    $$: (selector) => {
      if (selector === "[data-edit-week-date]") return weekButtons;
      if (selector === "[data-edit-calendar-date]") return dateButtons;
      if (selector === '[data-meal-context^="weekdate:"]') return [];
      if (selector === '[data-meal-context^="calendar:"]') return [calendarControl];
      if (selector === "[data-use-weekly-plan]") return [];
      return [];
    },
    t: (key) => key,
    escapeHtml,
    localize: (value) => value,
    formatDateKey,
    normalizeMealPlan: (meal) => ({ ...emptyMeal, ...meal }),
    mealSlots: [
      { key: "main", label: "mainSlot", choose: "chooseMain", categories: ["main"] },
      { key: "side", label: "sideSlot", choose: "chooseSide", categories: ["side"] },
      { key: "salad", label: "saladSlot", choose: "chooseSalad", categories: ["salad"] },
    ],
    handoffOptions,
    days,
    emptyMeal,
    categoryFor: (recipe) => recipe.category,
    activeWeekDateKeys,
    calendarMealForDateKey,
    mealHasContent: (meal) => Boolean(meal.main || meal.side || meal.salad || meal.notes),
    mealRecipes,
    mealHasWarning: () => false,
    mealSummary: (meal) => mealRecipes(meal).map(({ recipe }) => recipe.name).join(" · ") || "No meal",
    recipeById: (id) => recipes.find((recipe) => recipe.id === id),
    allRecipes: () => recipes,
    saveSharedState: async () => {
      state.saveCalls += 1;
    },
    render: () => {},
    getLang: () => "en",
    getSchedule: () => state.schedule,
    setSchedule: (schedule) => {
      state.schedule = schedule;
    },
    getCalendarMeals: () => state.calendarMeals,
    setCalendarMeals: (calendarMeals) => {
      state.calendarMeals = calendarMeals;
    },
    getVisibleMonth: () => new Date("2026-06-01T12:00:00"),
    setVisibleMonth: () => {},
  });

  return { calendarControl, dateButtons, elements, state, ui, weekButtons };
}

test("week planning renders seven summaries with one focused editor", () => {
  const { elements, ui } = harness();

  ui.renderSchedule();

  assert.equal((elements["#scheduleGrid"].innerHTML.match(/data-edit-week-date=/g) || []).length, 7);
  assert.doesNotMatch(elements["#scheduleGrid"].innerHTML, /<select/);
  assert.match(elements["#weekDateEditor"].innerHTML, /data-meal-context="weekdate:2026-06-22"/);
  assert.match(elements["#weekDateEditor"].innerHTML, /openMain: Main Recipe/);
  assert.match(elements["#weekDateEditor"].innerHTML, /data-slot="handoff"/);
});

test("selecting a week day focuses the selected editor heading", async () => {
  const { elements, ui, weekButtons } = harness();

  ui.renderSchedule();
  await weekButtons.find((button) => button.dataset.editWeekDate === "2026-06-24").dispatch("click");

  assert.equal(elements["#weekDateEditor"].scrolled, true);
  assert.equal(elements["#weekEditorHeading"].focused, true);
});

test("calendar stays read-only until a date opens its focused editor", async () => {
  const { dateButtons, elements, ui } = harness();

  ui.renderCalendar();

  assert.equal((elements["#calendarGrid"].innerHTML.match(/data-edit-calendar-date=/g) || []).length, 42);
  assert.doesNotMatch(elements["#calendarGrid"].innerHTML, /<select/);
  assert.equal(elements["#calendarDateEditor"].hidden, true);

  await dateButtons.find((button) => button.dataset.editCalendarDate === "2026-06-24").dispatch("click");

  assert.equal(elements["#calendarDateEditor"].hidden, false);
  assert.match(elements["#calendarDateEditor"].innerHTML, /data-meal-context="calendar:2026-06-24"/);
});

test("focused calendar edits preserve date override storage", async () => {
  const { calendarControl, dateButtons, state, ui } = harness();

  ui.renderCalendar();
  await dateButtons.find((button) => button.dataset.editCalendarDate === "2026-06-24").dispatch("click");
  await calendarControl.dispatch("change");

  assert.equal(state.calendarMeals["2026-06-24"].main, "main-recipe");
  assert.equal(state.saveCalls, 1);
});
