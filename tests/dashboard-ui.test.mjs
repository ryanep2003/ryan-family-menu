import assert from "node:assert/strict";
import test from "node:test";

import { createDashboardUi } from "../dashboard-ui.js";

function element() {
  return {
    textContent: "",
    innerHTML: "",
    hidden: true,
    disabled: false,
    handlers: {},
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
    focus() {
      this.focused = true;
    },
    scrollIntoView() {
      this.scrolled = true;
    },
  };
}

function dashboardFixture() {
  const elements = Object.fromEntries([
    "todayRecipeName",
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
  const meal = { main: "main", side: "side", salad: "", notes: "" };
  const recipes = {
    main: { id: "main", name: "Main recipe", allergyWarning: "" },
    side: { id: "side", name: "Side recipe", allergyWarning: "" },
  };
  const events = { view: "", selected: "", rendered: 0 };

  const ui = createDashboardUi({
    $: (selector) => elements[selector.slice(1)],
    $$: () => [],
    t: (key) => ({
      plannedRecipeOne: "1 planned recipe",
      plannedRecipeMany: "{count} planned recipes",
      noMealSet: "No meal set yet.",
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
    mealRecipes: () => [
      { key: "main", recipe: recipes.main },
      { key: "side", recipe: recipes.side },
    ],
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
