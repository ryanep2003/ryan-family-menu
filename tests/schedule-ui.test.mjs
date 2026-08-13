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

function harness({ mealPeriods = [] } = {}) {
  const elements = {
    "#scheduleGrid": element(),
    "#weekDateEditor": element(),
    "#weekEditorHeading": element(),
    "#weekTitle": element(),
    "#previousWeek": element(),
    "#thisWeek": element(),
    "#nextWeek": element(),
    "#copyWeekForward": element(),
    "#scheduleStatus": element(),
    "#resetWeek": element(),
    "#previousMonth": element(),
    "#todayMonth": element(),
    "#nextMonth": element(),
    "#monthTitle": element(),
    "#calendarWeekdays": element(),
    "#calendarGrid": element(),
    "#calendarAgenda": element(),
    "#calendarDateEditor": element({ hidden: true }),
  };
  const weekButtons = weekDates().map(({ dateKey }) => element({ dataset: { editWeekDate: dateKey } }));
  const dateButtons = calendarDates().map((dateKey) => element({ dataset: { editCalendarDate: dateKey } }));
  const calendarControl = element({
    dataset: { mealContext: "calendar:2026-06-24", slot: "main" },
    value: "main-recipe",
  });
  const weekHandoffControl = element({
    dataset: {
      mealContext: "weekdate:2026-06-22",
      slot: "handoff-detail",
      handoffField: "leftoverServings",
    },
    value: "two",
  });
  const weekRecipeControl = element({
    dataset: { mealContext: "weekdate:2026-06-22", slot: "main" },
    value: "main-recipe",
  });
  const weekRecipeSearch = element({
    dataset: { mealSearch: "weekdate:2026-06-22", searchSlot: "main" },
    value: "Another",
  });
  const weekRecipeSearchEmpty = element({
    dataset: { mealSearchEmpty: "weekdate:2026-06-22", searchSlot: "main" },
    hidden: true,
  });
  const recipes = [
    { id: "main-recipe", name: "Main Recipe", category: "main" },
    { id: "another-main", name: "Another Main", category: "main" },
    { id: "side-recipe", name: "Side Recipe", category: "side" },
    { id: "salad-recipe", name: "Salad Recipe", category: "salad" },
  ];
  const state = {
    schedule: Object.fromEntries(days.map((day) => [day.key, { ...emptyMeal }])),
    calendarMeals: {},
    saveCalls: 0,
    weekNavigation: [],
    currentWeekCalls: 0,
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
      if (selector === '[data-meal-context^="weekdate:"]') return [weekRecipeControl, weekHandoffControl];
      if (selector === '[data-meal-context^="calendar:"]') return [calendarControl];
      if (selector === '[data-meal-search^="weekdate:"]') return [weekRecipeSearch];
      if (selector === '[data-meal-search-empty^="weekdate:"]') return [weekRecipeSearchEmpty];
      if (selector === '[data-meal-search^="calendar:"]') return [];
      if (selector === '[data-meal-search-empty^="calendar:"]') return [];
      if (selector === "[data-use-weekly-plan]") return [];
      return [];
    },
    t: (key) => ({
      mealPeriodsNote: "Plan breakfast, lunch, or dinner as needed. Shared ingredients stay grouped in Groceries.",
      moreMealOptions: "More meal options",
      moreMealOptionsNote: "Add a side, salad, notes, or a handoff when you need them.",
    })[key] || key,
    escapeHtml,
    localize: (value) => value,
    formatDateKey,
    normalizeMealPlan: (meal) => ({ ...emptyMeal, ...meal }),
    mealSlots: [
      { key: "main", label: "mainSlot", choose: "chooseMain", categories: ["main"] },
      { key: "side", label: "sideSlot", choose: "chooseSide", categories: ["side"] },
      { key: "salad", label: "saladSlot", choose: "chooseSalad", categories: ["salad"] },
    ],
    mealPeriods,
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
    navigateWeek: async (offset) => {
      state.weekNavigation.push(offset);
    },
    goToCurrentWeek: async () => {
      state.currentWeekCalls += 1;
    },
    getCurrentWeekStartKey: () => "2026-06-22",
    getVisibleMonth: () => new Date("2026-06-01T12:00:00"),
    setVisibleMonth: () => {},
  });

  return {
    calendarControl,
    dateButtons,
    elements,
    state,
    ui,
    weekButtons,
    weekHandoffControl,
    weekRecipeControl,
    weekRecipeSearch,
    weekRecipeSearchEmpty,
  };
}

test("week planning renders seven summaries with one focused editor", () => {
  const { elements, ui } = harness();

  ui.renderSchedule();

  assert.equal((elements["#scheduleGrid"].innerHTML.match(/data-edit-week-date=/g) || []).length, 7);
  assert.doesNotMatch(elements["#scheduleGrid"].innerHTML, /<select/);
  assert.match(elements["#weekDateEditor"].innerHTML, /data-meal-context="weekdate:2026-06-22"/);
  assert.match(elements["#weekDateEditor"].innerHTML, /openMain: Main Recipe/);
  assert.match(elements["#weekDateEditor"].innerHTML, /data-slot="handoff"/);
  assert.match(elements["#weekDateEditor"].innerHTML, /More meal options/);
  assert.match(elements["#weekDateEditor"].innerHTML, /Shared ingredients stay grouped in Groceries/);
});

test("empty day keeps optional planning fields out of the first decision", () => {
  const { elements, state, ui } = harness();

  state.schedule.mon = { ...emptyMeal };
  ui.renderSchedule();

  assert.match(elements["#weekDateEditor"].innerHTML, /data-slot="main"/);
  assert.doesNotMatch(elements["#weekDateEditor"].innerHTML, /meal-optional-fields/);
  assert.doesNotMatch(elements["#weekDateEditor"].innerHTML, /data-slot="handoff"/);
});

test("meal-period planning shows breakfast, lunch, and dinner together", () => {
  const periods = [
    { key: "breakfast", label: "breakfastSlot", choose: "chooseBreakfast", categories: ["main"] },
    { key: "lunch", label: "lunchMainSlot", choose: "chooseLunchMain", categories: ["main"] },
    { key: "lunchSalad", label: "lunchSaladSlot", choose: "chooseLunchSalad", categories: ["salad"] },
    { key: "dinner", label: "dinnerSlot", choose: "chooseDinner", categories: ["main"] },
  ];
  const { elements, ui } = harness({ mealPeriods: periods });

  ui.renderSchedule();

  assert.match(elements["#weekDateEditor"].innerHTML, /data-slot="breakfast"/);
  assert.match(elements["#weekDateEditor"].innerHTML, /data-slot="lunch"/);
  assert.match(elements["#weekDateEditor"].innerHTML, /data-slot="lunchSalad"/);
  assert.match(elements["#weekDateEditor"].innerHTML, /data-slot="dinner"/);
  assert.match(elements["#weekDateEditor"].innerHTML, /type="search"/);
  assert.match(elements["#weekDateEditor"].innerHTML, /aria-describedby="meal-weekdate-2026-06-22-helper"/);
});

test("recipe search narrows a meal list before selection", async () => {
  const { ui, weekRecipeControl, weekRecipeSearch, weekRecipeSearchEmpty } = harness();

  ui.renderSchedule();
  await weekRecipeSearch.dispatch("input");

  assert.match(weekRecipeControl.innerHTML, /Another Main/);
  assert.doesNotMatch(weekRecipeControl.innerHTML, />Main Recipe</);
  assert.equal(weekRecipeControl.value, "");
  assert.equal(weekRecipeSearchEmpty.hidden, true);
});

test("handoff detail choices persist with the selected week meal", async () => {
  const { state, ui, weekHandoffControl } = harness();
  state.schedule.mon.handoff = {
    ...emptyMeal.handoff,
    leftovers: true,
  };

  ui.renderSchedule();
  await weekHandoffControl.dispatch("change");

  assert.equal(state.schedule.mon.handoff.leftoverServings, "two");
  assert.equal(state.saveCalls, 1);
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
  assert.match(elements["#calendarAgenda"].innerHTML, /Main Recipe/);

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

test("week navigation exposes previous, current, and next week actions", async () => {
  const { elements, state, ui } = harness();

  ui.bindScheduleControls();
  await elements["#previousWeek"].dispatch("click");
  await elements["#thisWeek"].dispatch("click");
  await elements["#nextWeek"].dispatch("click");

  assert.deepEqual(state.weekNavigation, [-1, 1]);
  assert.equal(state.currentWeekCalls, 1);
});
