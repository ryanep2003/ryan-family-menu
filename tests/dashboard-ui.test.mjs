import assert from "node:assert/strict";
import test from "node:test";

import { createDashboardUi } from "../dashboard-ui.js";
import { selectTodayStory } from "../almanac-selectors.js";
import { handoffOptions } from "../schedule-utils.js";

function element() {
  const classes = new Set();
  return {
    textContent: "",
    innerHTML: "",
    hidden: true,
    disabled: false,
    handlers: {},
    classList: {
      contains: (value) => classes.has(value),
      toggle(value, force) {
        if (force) classes.add(value);
        else classes.delete(value);
      },
    },
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
    focus() {
      this.focused = true;
    },
    scrollIntoView() {
      this.scrolled = true;
    },
    removeAttribute(name) {
      delete this[name];
    },
  };
}

function dashboardFixture({ mealOverride, availableFoodOverride = [] } = {}) {
  const elements = Object.fromEntries([
    "todayRecipeName",
    "todayDate",
    "todayBand",
    "todayImage",
    "todayBackdrop",
    "todayDateMark",
    "todayDayName",
    "todayDayNumber",
    "todayMeta",
    "todayMealList",
    "todayMemory",
    "todayMemoryFact",
    "todayMemoryWhen",
    "todayBefore",
    "todayBeforeText",
    "todayAfter",
    "todayAfterText",
    "todayHandoffSummary",
    "todayGrocerySummary",
    "todayInventorySummary",
    "todayHandoffOptions",
    "todayHandoffDetails",
    "todayHandoffNote",
    "todayUseFirst",
    "todayAvailableFoodList",
    "todayAvailableFoodForm",
    "todayAvailableFoodLabel",
    "todayAvailableFoodType",
    "todayAvailableFoodFreshness",
    "todayAvailableFoodStatus",
    "cookToday",
    "taskForm",
    "taskInput",
    "taskAssigneeInput",
    "recipeDetail",
    "detailName",
  ].map((id) => [id, element()]));
  const meal = mealOverride || {
    main: "main",
    side: "side",
    salad: "",
    notes: "",
    servingPlans: { dinner: { adults: 2, kids: 2, guests: 0, extraServings: 0 } },
  };
  const recipes = {
    main: { id: "main", name: "Main recipe", photos: ["main.jpg"], allergyWarning: "" },
    side: { id: "side", name: "Side recipe", photos: ["side.jpg"], allergyWarning: "" },
  };
  const events = { view: "", selected: "", rendered: 0, focusedDate: "" };

  const ui = createDashboardUi({
    $: (selector) => elements[selector.slice(1)],
    $$: () => [],
    t: (key) => ({
      plannedRecipeOne: "1 planned recipe",
      plannedRecipeMany: "{count} planned recipes",
      noMealSet: "No meal set yet.",
      cookButton: "Cook this",
      planDinner: "Plan dinner",
      nothingForTonight: "Nothing planned for tonight.",
      nothingForTonightNote: "Choose one meal and bring tonight into focus.",
      tonightServes: "Serves {count}",
      servedWith: "With",
      handoffAdd: "Leave a note for the next cook",
      handoffSaved: "Handoff saved",
      memoryEveryoneAte: "Everyone ate this last time.",
      memoryMadeDaysAgo: "{count} days ago.",
      planTonight: "Plan tonight",
      planTonightNote: "Choose a recipe and bring tonight into focus.",
      leftoversPlanned: "Leftovers planned",
      kidsSnack: "Kids snack",
      flexibleMeal: "Flexible meal",
      leftoversDetailLabel: "Leftover plan",
      leftoversFrom: "Leftovers from",
      leftoversSourceUnknown: "Add a meal first to name the leftovers.",
      leftoverServingsLabel: "How much is left?",
      leftoverServingsOne: "1 serving",
      leftoverServingsTwo: "2 servings",
      leftoverServingsThreePlus: "3+ servings",
      leftoverUseFirstLabel: "Use first for",
      leftoverUseLunch: "Lunch",
      leftoverUseSnack: "Kids snack",
      leftoverUseNextDinner: "Next dinner",
      leftoverUseAny: "Any meal",
      snackDetailLabel: "Kid snack",
      snackStatusLabel: "Snack status",
      snackReady: "Ready now",
      snackNeedsPrep: "Needs preparation",
      availableFoodUseFirst: "Use first",
      availableFoodEmpty: "Nothing is marked for later yet.",
      availableFoodSnack: "Snack",
      availableFoodLeftover: "Leftover",
      availableFoodToday: "Today",
      availableFoodTomorrow: "Tomorrow",
      availableFoodLater: "Later",
      availableFoodUseLabel: "Best for",
      availableFoodUseLunch: "Lunch",
      availableFoodUseSnack: "Kids snack",
      availableFoodUseNextDinner: "Next dinner",
      availableFoodUseAny: "Any meal",
      availableFoodUsed: "Used",
      itemsToBuy: "items to buy",
      itemsAtHome: "items at home",
      mainSlot: "Main",
      sideSlot: "Side",
    })[key] || key,
    escapeHtml: (value) => value,
    localize: (value) => value,
    formatDateKey: () => "2026-07-10",
    categoryFor: () => "main",
    categoryLabel: () => "Mains",
    mealRecipes: () => ["main", "side"]
      .filter((key) => meal[key])
      .map((key) => ({
        key,
        itemId: `item-${key}`,
        period: "dinner",
        role: key,
        recipe: recipes[meal[key]],
      })),
    mealHasWarning: () => false,
    calendarMealForDateKey: () => meal,
    recipeById: (id) => recipes[id],
    allRecipes: () => Object.values(recipes),
    saveSharedState: async () => {},
    render: () => {},
    renderDetail: () => {
      events.rendered += 1;
    },
    setView: (view) => {
      events.view = view;
    },
    getLang: () => "en",
    getFavorites: () => [],
    getTasks: () => [],
    setTasks: () => {},
    getGroceries: () => [],
    getInventory: () => [],
    getAvailableFood: () => availableFoodOverride,
    setAvailableFood: (next) => {
      availableFoodOverride = next;
    },
    getCalendarMeals: () => ({}),
    setCalendarMeals: () => {},
    handoffOptions,
    getSelectedRecipeId: () => events.selected,
    setSelectedRecipeId: (id) => {
      events.selected = id;
    },
    openFocusedDinnerPlan: (dateKey) => {
      events.focusedDate = dateKey;
    },
    selectTodayStory,
    getRecipeMemory: () => ({
      lastMade: "2026-07-01",
      fact: "everyoneAte",
      likedNames: [],
      skippedNames: [],
    }),
  });

  return { elements, events, ui };
}

test("Today presents one dinner, its family memory, and its companions", () => {
  const { elements, ui } = dashboardFixture();

  ui.renderToday();

  assert.equal(elements.todayMeta.textContent, "Serves 3");
  assert.equal(elements.todayMealList.textContent, "With Side recipe");
  assert.equal(elements.todayMemoryFact.textContent, "Everyone ate this last time.");
  assert.equal(elements.todayBackdrop.src, "main.jpg");
  assert.equal(elements.cookToday.textContent, "Cook this");
});

test("Today surfaces the most urgent available food first", () => {
  const { elements, ui } = dashboardFixture({
    availableFoodOverride: [
      { id: "later", label: "Crackers", type: "snack", freshness: "later", createdAt: "2026-07-17T08:00:00Z" },
      { id: "today", label: "Tuesday pasta", type: "leftover", freshness: "today", useFor: "lunch", createdAt: "2026-07-17T10:00:00Z" },
    ],
  });

  ui.renderToday();

  assert.equal(elements.todayUseFirst.innerHTML, "");
  assert.match(elements.todayAvailableFoodList.innerHTML, /Use first/);
  assert.match(elements.todayAvailableFoodList.innerHTML, /Tuesday pasta/);
  assert.match(elements.todayAvailableFoodList.innerHTML, /Leftover · Today/);
  assert.match(elements.todayAvailableFoodList.innerHTML, /Best for: Lunch/);
  assert.match(elements.todayAvailableFoodList.innerHTML, /available-food-row is-use-first/);
  assert.match(elements.todayAvailableFoodList.innerHTML, /data-remove-available-food="today"/);
});

test("Today renders optional handoff planning without changing the meal list", () => {
  const { elements, ui } = dashboardFixture({
    mealOverride: {
      main: "main",
      side: "side",
      salad: "",
      notes: "Save two portions for tomorrow.",
      handoff: { leftovers: true, kidsSnack: false, flexible: true },
    },
  });

  ui.renderToday();

  assert.match(elements.todayHandoffOptions.innerHTML, /data-today-handoff="leftovers"[^>]*checked/);
  assert.match(elements.todayHandoffOptions.innerHTML, /data-today-handoff="flexible"[^>]*checked/);
  assert.doesNotMatch(elements.todayHandoffOptions.innerHTML, /data-today-handoff="kidsSnack"[^>]*checked/);
  assert.equal(elements.todayHandoffNote.value, "Save two portions for tomorrow.");
});

test("Today renders compact leftover and snack choices from the handoff flags", () => {
  const { elements, ui } = dashboardFixture({
    mealOverride: {
      main: "main",
      side: "side",
      salad: "",
      notes: "",
      handoff: {
        leftovers: true,
        kidsSnack: true,
        flexible: false,
        leftoverServings: "two",
        leftoverUseFirst: "lunch",
        snackStatus: "ready",
        snack: "Fruit",
      },
    },
  });

  ui.renderToday();

  assert.match(elements.todayHandoffDetails.innerHTML, /Leftovers from:/);
  assert.match(elements.todayHandoffDetails.innerHTML, /value="two"[^>]*checked/);
  assert.match(elements.todayHandoffDetails.innerHTML, /value="lunch"[^>]*checked/);
  assert.match(elements.todayHandoffDetails.innerHTML, /value="ready"[^>]*checked/);
  assert.match(elements.todayHandoffDetails.innerHTML, /value="Fruit"/);
  assert.equal((elements.todayHandoffDetails.innerHTML.match(/type="radio"/g) || []).length, 9);
});

test("Cook this opens and focuses the selected recipe", () => {
  const { elements, events, ui } = dashboardFixture();
  ui.bindDashboardControls();

  elements.cookToday.handlers.click();

  assert.equal(events.selected, "main");
  assert.equal(events.view, "recipes");
  assert.equal(events.rendered, 1);
  assert.equal(elements.recipeDetail.hidden, false);
  assert.equal(elements.recipeDetail.scrolled, true);
  assert.equal(elements.detailName.focused, true);
});

test("empty Today offers a direct planning action", () => {
  const { elements, events, ui } = dashboardFixture({
    mealOverride: { main: "", side: "", salad: "", notes: "" },
  });
  ui.renderToday();
  ui.bindDashboardControls();

  assert.equal(elements.todayBand.classList.contains("empty"), true);
  assert.equal(elements.todayBackdrop.hidden, true);
  assert.equal(elements.todayMeta.textContent, "Choose one meal and bring tonight into focus.");
  assert.equal(elements.cookToday.textContent, "Plan dinner");

  elements.cookToday.handlers.click();
  assert.equal(events.focusedDate, "2026-07-10");
});
