import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createAssistantUi } from "../assistant-ui.js";
import { emptyMeal, formatDateKey, normalizeMealPlan } from "../schedule-utils.js";
import { translations } from "../translations.js";

function localDate(year, month, day, hour = 12, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function element(initial = {}) {
  const listeners = new Map();
  const classes = new Set();
  return {
    hidden: false,
    disabled: false,
    innerHTML: "",
    textContent: "",
    value: "",
    dataset: {},
    classList: {
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      contains: (name) => classes.has(name),
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    async dispatch(type, event = {}) {
      await listeners.get(type)?.({ preventDefault() {}, ...event });
    },
    focus() {
      this.focused = true;
    },
    ...initial,
  };
}

function mealWithDinner(recipeId) {
  return normalizeMealPlan({
    items: [{ id: `dinner-${recipeId}`, period: "dinner", role: "main", recipeId, sourceType: "recipe" }],
  });
}

function harness({ occupied = true } = {}) {
  const calls = {
    saveSchedule: 0,
    saveGroceries: 0,
    calendarWrites: [],
    groceryWrites: [],
    views: [],
    cooked: [],
  };
  const meals = occupied
    ? {
      "2026-09-03": mealWithDinner("pesto"),
      "2026-09-06": mealWithDinner("halibut"),
      "2026-09-13": mealWithDinner("roast"),
    }
    : {};
  let calendarMeals = { ...meals };
  let groceries = [{ id: "manual-1", text: { en: "Milk" }, source: "manual" }];
  const elements = {
    assistantSheet: element({ hidden: true }),
    assistantChips: element(),
    assistantPreview: element(),
    assistantStatus: element(),
    assistantApply: element({ hidden: true, disabled: true }),
    assistantClose: element(),
    assistantSheetTitle: element(),
    assistantAskForm: element(),
    assistantAskInput: element({ value: "" }),
  };
  const recipes = [
    { id: "tacos", name: { en: "Tacos" }, category: "main" },
    { id: "chili", name: { en: "Chili" }, category: "main" },
    { id: "roast", name: { en: "Pot roast" }, category: "main" },
  ];
  const ui = createAssistantUi({
    $: (selector) => elements[selector.slice(1)],
    $$: () => [],
    t: (key) => translations.en[key] || key,
    escapeHtml: (value) => `${value || ""}`,
    localize: (value) => value?.en || value || "",
    formatDateKey,
    getMealForDate: (dateKey) => calendarMeals[dateKey] || emptyMeal,
    getRecipes: () => recipes,
    getFavorites: () => ["tacos"],
    getDinnerEvents: () => [],
    getGroceries: () => groceries,
    generateGroceriesForDates: () => [{
      id: "g1",
      text: { en: "Tortillas" },
      source: "meal-plan",
      ingredientKey: "tortilla",
      mealUses: [{ dateKey: "2026-09-07", mealSlot: "dinner", recipeId: "tacos", recipeName: { en: "Tacos" } }],
    }],
    recipeById: (id) => recipes.find((recipe) => recipe.id === id) || null,
    now: () => localDate(2026, 9, 3, 20, 15),
    saveSchedule: async () => {
      calls.saveSchedule += 1;
      return true;
    },
    saveGroceries: async () => {
      calls.saveGroceries += 1;
      return true;
    },
    setCalendarMeals: (next) => {
      calendarMeals = next;
      calls.calendarWrites.push(next);
    },
    setGroceries: (next) => {
      groceries = next;
      calls.groceryWrites.push(next);
    },
    getCalendarMeals: () => calendarMeals,
    setView: (view) => calls.views.push(view),
    startCook: (recipe) => calls.cooked.push(recipe.id),
    documentObject: {
      body: { classList: { add() {}, remove() {} } },
      addEventListener() {},
    },
  });
  return { ui, calls, elements, getCalendar: () => calendarMeals };
}

test("previewing a dinner fill does not write until Apply", async () => {
  const { ui, calls } = harness();
  ui.openSheet("plan");
  ui.previewAction("plan-next-week");
  const preview = ui.getPreview();
  assert.equal(preview.kind, "fill-dinners");
  assert.ok(preview.assignments.length > 0);
  assert.deepEqual(preview.dateKeys[0], "2026-09-07");
  assert.ok(!preview.dateKeys.includes("2026-09-03"));
  assert.ok(!preview.assignments.some((item) => item.dateKey === "2026-09-03" || item.dateKey === "2026-09-13"));
  assert.equal(calls.saveSchedule, 0);
  assert.equal(calls.saveGroceries, 0);
  assert.equal(calls.calendarWrites.length, 0);
});

test("Apply writes empty-slot dinners through the schedule save path", async () => {
  const { ui, calls, getCalendar } = harness();
  ui.previewAction("plan-next-week");
  const saved = await ui.applyPreview();
  assert.equal(saved, true);
  assert.equal(calls.saveSchedule, 1);
  assert.equal(calls.saveGroceries, 0);
  assert.equal(dinnerRecipe(getCalendar()["2026-09-03"]), "pesto");
  assert.equal(dinnerRecipe(getCalendar()["2026-09-06"]), "halibut");
  assert.equal(dinnerRecipe(getCalendar()["2026-09-13"]), "roast");
  assert.equal(dinnerRecipe(getCalendar()["2026-09-07"]), "tacos");
});

function dinnerRecipe(meal) {
  return (meal?.items || []).find((item) => item.period === "dinner")?.recipeId || "";
}

test("Apply is required before a shopping refresh writes", async () => {
  const { ui, calls } = harness();
  ui.previewAction("refresh-shopping");
  assert.equal(calls.saveGroceries, 0);
  assert.equal(ui.getPreview().generatedCount, 1);
  const saved = await ui.applyPreview();
  assert.equal(saved, true);
  assert.equal(calls.saveGroceries, 1);
  assert.equal(calls.saveSchedule, 0);
});

test("dinner lookup navigates without using Apply or a schedule write", async () => {
  const { ui, calls } = harness();
  ui.previewAction("dinner-today");
  assert.equal(ui.getPreview().kind, "dinner-lookup");
  assert.equal(await ui.applyPreview(), false);
  assert.equal(calls.saveSchedule, 0);
});

test("What's for dinner today and tomorrow use local Thursday-evening dates", async () => {
  const { ui, elements } = harness();
  ui.previewAction("dinner-today");
  assert.equal(ui.getPreview().when, "today");
  assert.equal(ui.getPreview().dateKey, "2026-09-03");
  assert.match(elements.assistantPreview.innerHTML, /Tonight/);
  assert.match(elements.assistantPreview.innerHTML, /Sep 3/);

  ui.previewAction("dinner-tomorrow");
  assert.equal(ui.getPreview().when, "tomorrow");
  assert.equal(ui.getPreview().dateKey, "2026-09-04");
  assert.match(elements.assistantPreview.innerHTML, /Tomorrow night/);
  assert.match(elements.assistantPreview.innerHTML, /Sep 4/);
  assert.doesNotMatch(elements.assistantPreview.innerHTML, /Tonight/);
});

test("tomorrow chip does not treat dinner-tomorrow as today", async () => {
  const source = await readFile(new URL("../assistant-ui.js", import.meta.url), "utf8");
  assert.match(source, /action === "dinner-tomorrow" \? "tomorrow"/);
  assert.doesNotMatch(source, /action === "tomorrow" \? "tomorrow"/);
});

test("Today and Plan expose Help entry points and the action sheet", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="assistantHelpToday"[^>]*data-open-assistant="today"/);
  assert.match(html, /id="todayDailyLoop"[\s\S]*id="assistantHelpToday"/);
  assert.match(html, /id="assistantHelpPlan"[^>]*data-open-assistant="plan"/);
  assert.match(html, /id="assistantHelpPlanSticky"[^>]*data-open-assistant="plan"/);
  assert.match(html, /id="assistantSheet"/);
  assert.match(html, /id="assistantApply"[^>]*data-i18n="assistantApply"/);
  assert.doesNotMatch(html, /id="groceryView"[\s\S]*data-open-assistant="shop"/);
  const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.match(app, /createAssistantUi\(/);
  assert.match(app, /saveSchedule,/);
  const schedule = await readFile(new URL("../schedule-ui.js", import.meta.url), "utf8");
  assert.match(schedule, /data-open-assistant="plan"/);
  assert.match(schedule, /saveMealChanges/);
});
