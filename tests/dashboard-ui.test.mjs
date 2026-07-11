import assert from "node:assert/strict";
import test from "node:test";

import { createDashboardUi } from "../dashboard-ui.js";

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

function dashboardFixture({ mealOverride } = {}) {
  const elements = Object.fromEntries([
    "todayRecipeName",
    "todayBand",
    "todayBackdrop",
    "todayMeta",
    "todayMealList",
    "todayGrocerySummary",
    "todayInventorySummary",
    "cookToday",
    "taskForm",
    "taskInput",
    "taskAssigneeInput",
    "recipeDetail",
    "detailName",
  ].map((id) => [id, element()]));
  const meal = mealOverride || { main: "main", side: "side", salad: "", notes: "" };
  const recipes = {
    main: { id: "main", name: "Main recipe", photos: ["main.jpg"], allergyWarning: "" },
    side: { id: "side", name: "Side recipe", photos: ["side.jpg"], allergyWarning: "" },
  };
  const events = { view: "", selected: "", rendered: 0 };

  const ui = createDashboardUi({
    $: (selector) => elements[selector.slice(1)],
    $$: () => [],
    t: (key) => ({
      plannedRecipeOne: "1 planned recipe",
      plannedRecipeMany: "{count} planned recipes",
      noMealSet: "No meal set yet.",
      cookButton: "Cook this",
      planTonight: "Plan tonight",
      planTonightNote: "Choose a recipe and bring tonight into focus.",
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
      .map((key) => ({ key, recipe: recipes[meal[key]] })),
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
    getCalendarMeals: () => ({}),
    setCalendarMeals: () => {},
    getSelectedRecipeId: () => events.selected,
    setSelectedRecipeId: (id) => {
      events.selected = id;
    },
  });

  return { elements, events, ui };
}

test("Today uses natural pluralized meal copy", () => {
  const { elements, ui } = dashboardFixture();

  ui.renderToday();

  assert.equal(elements.todayMeta.textContent, "2 planned recipes");
  assert.equal(elements.todayBackdrop.src, "main.jpg");
  assert.equal(elements.cookToday.textContent, "Cook this");
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
  assert.equal(elements.todayMeta.textContent, "Choose a recipe and bring tonight into focus.");
  assert.equal(elements.cookToday.textContent, "Plan tonight");

  elements.cookToday.handlers.click();
  assert.equal(events.view, "schedule");
});
