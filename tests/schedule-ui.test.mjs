import assert from "node:assert/strict";
import test from "node:test";

import { createScheduleUi } from "../schedule-ui.js";
import { days, emptyMeal, formatDateKey, handoffOptions, mealPeriods, mealRoles, normalizeMealPlan } from "../schedule-utils.js";

function element(initial = {}) {
  const listeners = new Map();
  const classes = new Set();
  return {
    hidden: false,
    innerHTML: "",
    textContent: "",
    dataset: {},
    value: "",
    attributes: {},
    classList: {
      contains(name) {
        return classes.has(name);
      },
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
    },
    setAttribute(name, value) {
      this.attributes[name] = `${value}`;
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    async dispatch(type, target = this) {
      await listeners.get(type)?.({ target });
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

function harness({ periods = mealPeriods, leftovers = [] } = {}) {
  const elements = {
    "#scheduleGrid": element(),
    "#weekDateEditor": element(),
    "#weekEditorHeading": element(),
    "#weekPlanningPanel": element(),
    "#monthPlanningPanel": element({ hidden: true }),
    "#weekPlanningTab": element({ dataset: { planningMode: "week" } }),
    "#monthPlanningTab": element({ dataset: { planningMode: "month" } }),
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
    "#calendarEditorHeading": element(),
  };
  const weekButtons = weekDates().map(({ dateKey }) => element({ dataset: { editWeekDate: dateKey } }));
  const dateButtons = calendarDates().map((dateKey) => element({ dataset: { editCalendarDate: dateKey } }));
  const calendarControl = element({
    dataset: { mealContext: "calendar:2026-06-24", slot: "notes" },
    value: "Dinner out",
  });
  const weekHandoffControl = element({
    dataset: {
      mealContext: "weekdate:2026-06-22",
      slot: "handoff-detail",
      handoffField: "leftoverServings",
    },
    value: "two",
  });
  const weekServingControl = element({
    dataset: {
      mealContext: "weekdate:2026-06-22",
      slot: "serving-plan",
      period: "lunch",
      servingField: "adults",
    },
    value: "1",
  });
  const weekActualLeftoverControl = element({
    dataset: {
      mealContext: "weekdate:2026-06-22",
      slot: "actual-leftovers",
      itemId: "legacy-dinner-main-0-main-recipe",
    },
    value: "2.5",
  });
  const weekGroceryButton = element({
    dataset: { viewMealGroceries: "weekdate:2026-06-22", period: "dinner" },
  });
  const weekRecipeControl = element({
    dataset: { addMealRecipe: "weekdate:2026-06-22", period: "dinner" },
    value: "",
  });
  const weekRecipeSearch = element({
    dataset: { mealItemSearch: "weekdate:2026-06-22", period: "dinner" },
    value: "Another",
  });
  const weekRecipeSearchEmpty = element({
    dataset: { mealItemEmpty: "weekdate:2026-06-22", period: "dinner" },
    hidden: true,
  });
  const weekRecipeResults = element({
    dataset: { mealRecipeResults: "weekdate:2026-06-22", period: "dinner" },
  });
  const weekAddButton = element({ dataset: { addMealItem: "weekdate:2026-06-22", period: "dinner" }, disabled: true });
  const weekRoleControl = element({ dataset: { addMealRole: "weekdate:2026-06-22", period: "dinner" }, value: "main" });
  const weekLeftoverSource = element({ dataset: { addLeftoverSource: "weekdate:2026-06-22", period: "lunch" }, value: "" });
  const weekLeftoverServings = element({ dataset: { addLeftoverServings: "weekdate:2026-06-22", period: "lunch" }, value: "1" });
  const weekLeftoverAddButton = element({ dataset: { addLeftoverItem: "weekdate:2026-06-22", period: "lunch" }, disabled: true });
  const recipes = [
    { id: "main-recipe", name: "Main Recipe", category: "main" },
    { id: "another-main", name: "Another Main", category: "main" },
    { id: "side-recipe", name: "Side Recipe", category: "side" },
    { id: "salad-recipe", name: "Salad Recipe", category: "salad" },
    { id: "dessert-recipe", name: "Dessert Recipe", category: "dessert" },
  ];
  const state = {
    schedule: Object.fromEntries(days.map((day) => [day.key, { ...emptyMeal }])),
    calendarMeals: {},
    saveCalls: 0,
    weekNavigation: [],
    currentWeekCalls: 0,
    groceryTargets: [],
  };
  state.schedule.mon = normalizeMealPlan({ main: "main-recipe" });

  const activeWeekDateKeys = () => weekDates();
  const calendarMealForDateKey = (dateKey) => {
    if (state.calendarMeals[dateKey]) return normalizeMealPlan(state.calendarMeals[dateKey]);
    const weekDate = weekDates().find((day) => day.dateKey === dateKey);
    return weekDate ? normalizeMealPlan(state.schedule[weekDate.key]) : normalizeMealPlan();
  };
  const mealRecipes = (meal) => normalizeMealPlan(meal).items
    .map((item) => ({ ...item, key: item.period, recipe: recipes.find((recipe) => recipe.id === item.recipeId) }))
    .filter(({ recipe }) => recipe);

  const ui = createScheduleUi({
    $: (selector) => elements[selector],
    $$: (selector) => {
      if (selector === "[data-planning-mode]") return [elements["#weekPlanningTab"], elements["#monthPlanningTab"]];
      if (selector === "[data-edit-week-date]") return weekButtons;
      if (selector === "[data-edit-calendar-date]") return dateButtons;
      if (selector === '[data-meal-context^="weekdate:"]') return [weekHandoffControl, weekServingControl, weekActualLeftoverControl];
      if (selector === '[data-view-meal-groceries^="weekdate:"]') return [weekGroceryButton];
      if (selector === '[data-meal-context^="calendar:"]') return [calendarControl];
      if (selector === '[data-view-meal-groceries^="calendar:"]') return [];
      if (selector === '[data-meal-item-search^="weekdate:"]') return [weekRecipeSearch];
      if (selector === '[data-meal-item-empty^="weekdate:"]') return [weekRecipeSearchEmpty];
      if (selector === '[data-meal-recipe-results^="weekdate:"]') return [weekRecipeResults];
      if (selector === '[data-add-meal-recipe^="weekdate:"]') return [weekRecipeControl];
      if (selector === '[data-add-meal-item^="weekdate:"]') return [weekAddButton];
      if (selector === '[data-add-meal-role^="weekdate:"]') return [weekRoleControl];
      if (selector === '[data-remove-meal-item][data-meal-context^="weekdate:"]') return [];
      if (selector === '[data-add-leftover-source^="weekdate:"]') return [weekLeftoverSource];
      if (selector === '[data-add-leftover-servings^="weekdate:"]') return [weekLeftoverServings];
      if (selector === '[data-add-leftover-item^="weekdate:"]') return [weekLeftoverAddButton];
      if (selector === '[data-meal-item-search^="calendar:"]') return [];
      if (selector === '[data-meal-item-empty^="calendar:"]') return [];
      if (selector === '[data-meal-recipe-results^="calendar:"]') return [];
      if (selector === '[data-add-meal-recipe^="calendar:"]') return [];
      if (selector === '[data-add-meal-item^="calendar:"]') return [];
      if (selector === '[data-add-meal-role^="calendar:"]') return [];
      if (selector === '[data-remove-meal-item][data-meal-context^="calendar:"]') return [];
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
    normalizeMealPlan,
    mealPeriods: periods,
    mealRoles,
    handoffOptions,
    days,
    emptyMeal,
    categoryFor: (recipe) => recipe.category,
    activeWeekDateKeys,
    calendarMealForDateKey,
    mealHasContent: (meal) => Boolean(normalizeMealPlan(meal).items.length || meal.notes),
    mealRecipes,
    mealHasWarning: () => false,
    mealSummary: (meal) => mealRecipes(meal).map(({ recipe }) => recipe.name).join(" · ") || "No meal",
    recipeById: (id) => recipes.find((recipe) => recipe.id === id),
    allRecipes: () => recipes,
    availableLeftoversForDate: () => leftovers,
    openGroceriesForMeal: (dateKey, mealSlot) => {
      state.groceryTargets.push([dateKey, mealSlot]);
    },
    saveSharedState: async () => {
      state.saveCalls += 1;
    },
    render: () => {},
    getLang: () => "en",
    getSchedule: () => state.schedule,
    setSchedule: (schedule) => {
      state.schedule = Object.fromEntries(Object.entries(schedule).map(([key, meal]) => [key, normalizeMealPlan(meal)]));
    },
    getCalendarMeals: () => state.calendarMeals,
    setCalendarMeals: (calendarMeals) => {
      state.calendarMeals = Object.fromEntries(Object.entries(calendarMeals).map(([key, meal]) => [key, normalizeMealPlan(meal)]));
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
    weekAddButton,
    weekHandoffControl,
    weekGroceryButton,
    weekServingControl,
    weekActualLeftoverControl,
    weekLeftoverSource,
    weekLeftoverServings,
    weekLeftoverAddButton,
    weekRoleControl,
    weekRecipeControl,
    weekRecipeSearch,
    weekRecipeSearchEmpty,
    weekRecipeResults,
  };
}

test("week planning renders seven summaries with one focused editor", () => {
  const { elements, ui } = harness();

  ui.renderSchedule();

  assert.equal((elements["#scheduleGrid"].innerHTML.match(/data-edit-week-date=/g) || []).length, 7);
  assert.doesNotMatch(elements["#scheduleGrid"].innerHTML, /<select/);
  assert.match(elements["#weekDateEditor"].innerHTML, /data-meal-context="weekdate:2026-06-22"/);
  assert.match(elements["#weekDateEditor"].innerHTML, /Main Recipe/);
  assert.match(elements["#weekDateEditor"].innerHTML, /data-item-id="legacy-dinner-main-0-main-recipe"/);
  assert.match(elements["#weekDateEditor"].innerHTML, /data-slot="handoff"/);
  assert.match(elements["#weekDateEditor"].innerHTML, /More meal options/);
  assert.match(elements["#weekDateEditor"].innerHTML, /flexibleMealBuilderNote/);
  assert.match(elements["#weekDateEditor"].innerHTML, /data-view-meal-groceries="weekdate:2026-06-22"/);
});

test("planned meal can open groceries filtered to its date and meal period", async () => {
  const { state, ui, weekGroceryButton } = harness();

  ui.renderSchedule();
  await weekGroceryButton.dispatch("click");

  assert.deepEqual(state.groceryTargets, [["2026-06-22", "dinner"]]);
});

test("one meal can hold a main, side, salad, and dessert", async () => {
  const { state, ui, weekRecipeResults } = harness();

  ui.renderSchedule();
  for (const [recipeId, expectedRole] of [
    ["side-recipe", "side"],
    ["salad-recipe", "salad"],
    ["dessert-recipe", "dessert"],
  ]) {
    await weekRecipeResults.dispatch("click", {
      closest(selector) {
        return selector === "[data-add-meal-result]" ? {
          dataset: {
            addMealResult: "weekdate:2026-06-22",
            period: "dinner",
            recipeId,
          },
        } : null;
      },
    });
    assert.equal(state.schedule.mon.items.at(-1).role, expectedRole);
  }

  assert.deepEqual(state.schedule.mon.items.map(({ role, recipeId }) => [role, recipeId]), [
    ["main", "main-recipe"],
    ["side", "side-recipe"],
    ["salad", "salad-recipe"],
    ["dessert", "dessert-recipe"],
  ]);
  assert.equal(state.saveCalls, 3);
});

test("empty day keeps optional planning fields out of the first decision", () => {
  const { elements, state, ui } = harness();

  state.schedule.mon = { ...emptyMeal };
  ui.renderSchedule();

  assert.match(elements["#weekDateEditor"].innerHTML, /data-meal-recipe-results="weekdate:2026-06-22"/);
  assert.doesNotMatch(elements["#weekDateEditor"].innerHTML, /meal-optional-fields/);
  assert.doesNotMatch(elements["#weekDateEditor"].innerHTML, /data-slot="handoff"/);
});

test("meal-period planning shows breakfast, lunch, and dinner together", () => {
  const { elements, ui } = harness();

  ui.renderSchedule();

  assert.match(elements["#weekDateEditor"].innerHTML, /data-period="breakfast"/);
  assert.match(elements["#weekDateEditor"].innerHTML, /data-period="lunch"/);
  assert.match(elements["#weekDateEditor"].innerHTML, /data-period="dinner"/);
  assert.doesNotMatch(elements["#weekDateEditor"].innerHTML, /data-period="lunchSalad"/);
  assert.match(elements["#weekDateEditor"].innerHTML, /type="search"/);
  assert.match(elements["#weekDateEditor"].innerHTML, /data-meal-recipe-results=/);
});

test("recipe search shows one-tap matching results", async () => {
  const { ui, weekRecipeResults, weekRecipeSearch, weekRecipeSearchEmpty } = harness();

  ui.renderSchedule();
  await weekRecipeSearch.dispatch("input");

  assert.match(weekRecipeResults.innerHTML, /Another Main/);
  assert.doesNotMatch(weekRecipeResults.innerHTML, />Main Recipe</);
  assert.match(weekRecipeResults.innerHTML, /data-add-meal-result=/);
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

test("each meal period can adjust its own family serving count", async () => {
  const { state, ui, weekServingControl } = harness();

  ui.renderSchedule();
  await weekServingControl.dispatch("change");

  assert.equal(state.schedule.mon.servingPlans.lunch.adults, 1);
  assert.equal(state.schedule.mon.servingPlans.dinner.adults, 2);
});

test("actual leftovers attach to the exact cooked item", async () => {
  const { state, ui, weekActualLeftoverControl } = harness();

  ui.renderSchedule();
  await weekActualLeftoverControl.dispatch("change");

  assert.equal(state.schedule.mon.servingPlan.actualLeftovers["legacy-dinner-main-0-main-recipe"], 2.5);
});

test("recorded leftovers can be allocated to a later meal", async () => {
  const source = {
    sourceDate: "2026-06-21",
    itemId: "source-main",
    recipe: { id: "main-recipe", name: "Main Recipe", category: "main" },
    availableServings: 2.5,
  };
  const {
    state,
    ui,
    weekLeftoverAddButton,
    weekLeftoverSource,
  } = harness({ leftovers: [source] });

  ui.renderSchedule();
  weekLeftoverSource.value = "2026-06-21::source-main";
  await weekLeftoverSource.dispatch("change");
  assert.equal(weekLeftoverAddButton.disabled, false);
  await weekLeftoverAddButton.dispatch("click");

  const leftover = state.schedule.mon.items.find((item) => item.sourceType === "leftover");
  assert.equal(leftover.recipeId, "main-recipe");
  assert.equal(leftover.period, "lunch");
  assert.equal(leftover.servings, 1);
  assert.equal(leftover.leftoverSourceDate, "2026-06-21");
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
  assert.match(elements["#calendarDateEditor"].innerHTML, /data-meal-recipe-results="calendar:2026-06-24"/);
  assert.equal(elements["#calendarDateEditor"].scrolled, true);
  assert.equal(elements["#calendarEditorHeading"].focused, true);
});

test("week and month planning are separate focused views", async () => {
  const { elements, ui } = harness();

  ui.renderSchedule();
  ui.bindScheduleControls();
  assert.equal(elements["#weekPlanningPanel"].hidden, false);
  assert.equal(elements["#monthPlanningPanel"].hidden, true);

  await elements["#monthPlanningTab"].dispatch("click");
  assert.equal(elements["#weekPlanningPanel"].hidden, true);
  assert.equal(elements["#monthPlanningPanel"].hidden, false);
  assert.equal(elements["#monthPlanningTab"].attributes["aria-selected"], "true");
});

test("focused calendar edits preserve date override storage", async () => {
  const { calendarControl, dateButtons, state, ui } = harness();

  ui.renderCalendar();
  await dateButtons.find((button) => button.dataset.editCalendarDate === "2026-06-24").dispatch("click");
  await calendarControl.dispatch("change");

  assert.equal(state.calendarMeals["2026-06-24"].notes.en, "Dinner out");
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
