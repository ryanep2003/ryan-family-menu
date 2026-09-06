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
      add(name) {
        classes.add(name);
      },
      remove(name) {
        classes.delete(name);
      },
      toggle(name, force) {
        if (force === undefined) {
          if (classes.has(name)) classes.delete(name);
          else classes.add(name);
          return;
        }
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

function harness({ occupied = true, saveSchedule, saveGroceries, initialGroceries, generatedForDates, inventoryCoverage, language = "en" } = {}) {
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
  let groceries = initialGroceries || [{ id: "manual-1", text: { en: "Milk" }, source: "manual" }];
  const documentListeners = new Map();
  let focusedShoppingDate = "";
  const elements = {
    assistantSheet: element({ hidden: true }),
    assistantChips: element(),
    assistantPreview: element(),
    assistantStatusRow: element(),
    assistantStatus: element(),
    assistantSpinner: element({ hidden: true }),
    assistantApply: element({ hidden: true, disabled: true }),
    assistantClose: element(),
    assistantSheetTitle: element(),
    assistantAskForm: element(),
    assistantAskInput: element({ value: "" }),
    assistantAskSubmit: element(),
  };
  const recipes = [
    { id: "tacos", name: { en: "Tacos" }, category: "main" },
    { id: "chili", name: { en: "Chili" }, category: "main" },
    { id: "roast", name: { en: "Pot roast" }, category: "main" },
  ];
  const ui = createAssistantUi({
    $: (selector) => elements[selector.slice(1)],
    $$: () => [],
    t: (key) => translations[language][key] || key,
    escapeHtml: (value) => `${value || ""}`,
    localize: (value) => value?.[language] || value?.en || value || "",
    getLang: () => language,
    formatDateKey,
    getMealForDate: (dateKey) => calendarMeals[dateKey] || emptyMeal,
    getRecipes: () => recipes,
    getFavorites: () => ["tacos"],
    getDinnerEvents: () => [],
    getGroceries: () => groceries,
    applyInventoryCoverage: inventoryCoverage || ((items) => items),
    generateGroceriesForDates: (dateKeys) => generatedForDates ? generatedForDates(dateKeys) : [{
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
      if (saveSchedule) return saveSchedule();
      return true;
    },
    saveGroceries: async () => {
      calls.saveGroceries += 1;
      if (saveGroceries) return saveGroceries();
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
      addEventListener(type, listener) { documentListeners.set(type, listener); },
      querySelector(selector) {
        const dateKey = selector.match(/data-assistant-shopping-date="([^"]+)"/)?.[1];
        return dateKey ? { focus() { focusedShoppingDate = dateKey; } } : null;
      },
    },
  });
  return {
    ui,
    calls,
    elements,
    getCalendar: () => calendarMeals,
    setExternalGroceries: (items) => { groceries = items; },
    getFocusedShoppingDate: () => focusedShoppingDate,
    dispatchDocument: async (type, event) => documentListeners.get(type)?.({ preventDefault() {}, ...event }),
  };
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
  assert.match(html, /id="assistantAskSubmit"/);
  assert.match(html, /id="assistantSpinner"/);
  assert.match(html, /id="assistantStatusRow"[^>]*aria-live="polite"/);
  assert.match(html, /data-i18n-placeholder="assistantAskPlaceholder"/);
  assert.doesNotMatch(html, /placeholder="Coming soon"/);
  assert.doesNotMatch(html, /id="groceryView"[\s\S]*data-open-assistant="shop"/);
  const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.match(app, /createAssistantUi\(/);
  assert.match(app, /saveSchedule,/);
  const schedule = await readFile(new URL("../schedule-ui.js", import.meta.url), "utf8");
  assert.match(schedule, /data-open-assistant="plan"/);
  assert.match(schedule, /saveMealChanges/);
});

test("Ask routes an explicit typed request to the same preview as the matching chip", async () => {
  const { ui, elements, calls } = harness();
  ui.bindAssistantControls();
  ui.openSheet("today");
  elements.assistantAskInput.value = "Plan dinners next week";
  await elements.assistantAskForm.dispatch("submit");
  const preview = ui.getPreview();
  assert.equal(preview.kind, "fill-dinners");
  assert.equal(preview.action, "plan-next-week");
  assert.deepEqual(preview.dateKeys[0], "2026-09-07");
  assert.match(elements.assistantPreview.innerHTML, /Fill empty dinners/);
  assert.doesNotMatch(elements.assistantPreview.innerHTML, /coming soon/i);
  assert.equal(calls.saveSchedule, 0);
  assert.equal(elements.assistantApply.hidden, false);
  assert.equal(elements.assistantApply.disabled, false);
});

test("shopping customization question with the screenshot typo stays a clarification with no Apply", async () => {
  const { ui, elements, calls } = harness();
  ui.bindAssistantControls();
  ui.openSheet("plan");
  elements.assistantAskInput.value = "can you cusomize a shopping list?";
  await elements.assistantAskForm.dispatch("submit");
  assert.equal(ui.getPreview().kind, "shopping-clarification");
  assert.match(elements.assistantPreview.innerHTML, /What would you like to change/);
  assert.match(elements.assistantPreview.innerHTML, /Add or edit items/);
  assert.match(elements.assistantPreview.innerHTML, /Choose planned dates/);
  assert.equal(elements.assistantApply.hidden, true);
  assert.equal(calls.saveGroceries, 0);
});

test("Spanish shopping capability question keeps the same clarification choices", async () => {
  const { ui, elements } = harness({ language: "es" });
  ui.bindAssistantControls();
  ui.openSheet("plan");
  elements.assistantAskInput.value = "¿puedo personalizar la lista de compras?";
  await elements.assistantAskForm.dispatch("submit");
  assert.equal(ui.getPreview().kind, "shopping-clarification");
  assert.match(elements.assistantPreview.innerHTML, /Personalizar la lista de compras/);
  assert.match(elements.assistantPreview.innerHTML, /Agregar o editar artículos/);
  assert.equal(elements.assistantApply.hidden, true);
});

test("shopping date draft supports multiple selections, unchecking, previewing, and returning to edit", async () => {
  const { ui, elements, dispatchDocument, getFocusedShoppingDate } = harness({
    generatedForDates: (dateKeys) => dateKeys.flatMap((dateKey) => ({
      "2026-09-03": [{ id: "g1", text: { en: "Tortillas" }, source: "meal-plan", ingredientKey: "tortilla", mealUses: [{ dateKey, mealSlot: "dinner", recipeId: "tacos" }] }],
      "2026-09-04": [{ id: "g2", text: { en: "Beans" }, source: "meal-plan", ingredientKey: "beans", mealUses: [{ dateKey, mealSlot: "dinner", recipeId: "chili" }] }],
    }[dateKey] || [])),
  });
  ui.bindAssistantControls();
  ui.openSheet("today");
  await dispatchDocument("click", { target: { closest: (selector) => selector === "[data-assistant-shopping-choice]" ? { dataset: { assistantShoppingChoice: "dates" } } : null } });
  assert.equal(ui.getPreview().kind, "shopping-dates");
  const dateChange = (dateKey, checked) => dispatchDocument("change", { target: {
    closest: (selector) => selector === "[data-assistant-shopping-date]" ? { checked, dataset: { assistantShoppingDate: dateKey } } : null,
  } });
  await dateChange("2026-09-03", true);
  assert.equal(getFocusedShoppingDate(), "2026-09-03");
  await dateChange("2026-09-04", true);
  assert.equal(ui.getPreview().kind, "shopping-dates");
  assert.match(elements.assistantPreview.innerHTML, /checked/);
  assert.doesNotMatch(elements.assistantPreview.innerHTML, /disabled/);
  await dispatchDocument("click", { target: { closest: (selector) => selector === "[data-assistant-shopping-preview]" ? { disabled: false } : null } });
  assert.equal(ui.getPreview().kind, "shopping");
  assert.deepEqual(ui.getPreview().dateKeys, ["2026-09-03", "2026-09-04"]);
  assert.match(elements.assistantPreview.innerHTML, /Tortillas/);
  assert.match(elements.assistantPreview.innerHTML, /Beans/);
  assert.match(elements.assistantPreview.innerHTML, /Add/);
  await dispatchDocument("click", { target: { closest: (selector) => selector === "[data-assistant-shopping-edit-dates]" ? {} : null } });
  await dateChange("2026-09-03", false);
  await dateChange("2026-09-04", false);
  assert.equal(ui.getPreview().kind, "shopping-dates");
  assert.match(elements.assistantPreview.innerHTML, /disabled/);
});

test("editing a typed request immediately invalidates a visible shopping confirmation", async () => {
  const { ui, elements } = harness();
  ui.bindAssistantControls();
  ui.openSheet("today");
  ui.previewAction("refresh-shopping");
  assert.equal(elements.assistantApply.hidden, false);
  elements.assistantAskInput.value = "can you cusomize a shopping list?";
  await elements.assistantAskInput.dispatch("input");
  assert.equal(ui.getPreview(), null);
  assert.equal(elements.assistantApply.hidden, true);
  await elements.assistantAskForm.dispatch("submit");
  assert.equal(ui.getPreview().kind, "shopping-clarification");
  assert.match(elements.assistantPreview.innerHTML, /can you cusomize a shopping list/);
});

test("shopping preview describes actual quantity and checked changes", () => {
  const oldPlanned = {
    id: "old-tortilla", source: "meal-plan", ingredientKey: "tortilla", text: { en: "1 tortilla" }, checked: true,
    plannedQuantities: { en: 1 }, remainingQuantities: { en: 1 }, plannedUnits: { en: "each" },
    mealUses: [{ dateKey: "2026-09-03", mealSlot: "dinner", recipeId: "tacos" }],
  };
  const { ui, elements } = harness({
    initialGroceries: [oldPlanned],
    inventoryCoverage: (items) => items.map((item) => ({ ...item, checked: true, inInventory: true, inventoryDecision: "have" })),
    generatedForDates: () => [{
      id: "new-tortilla", source: "meal-plan", ingredientKey: "tortilla", text: { en: "2 tortillas" }, checked: false,
      plannedQuantities: { en: 2 }, remainingQuantities: { en: 2 }, plannedUnits: { en: "each" },
      mealUses: [{ dateKey: "2026-09-03", mealSlot: "dinner", recipeId: "tacos" }],
    }],
  });
  ui.previewAction("refresh-shopping");
  assert.match(elements.assistantPreview.innerHTML, /Quantity: 1 each → 2 each/);
  assert.match(elements.assistantPreview.innerHTML, /Covered at home/);
});

test("Spanish quantity detail uses Spanish values and retains zero", () => {
  const oldPlanned = {
    id: "old-beans", source: "meal-plan", ingredientKey: "beans", text: { en: "beans", es: "frijoles" },
    plannedQuantities: { es: 0 }, remainingQuantities: { es: 0 }, plannedUnits: { es: "latas" }, mealUses: [],
  };
  const { ui, elements } = harness({
    language: "es",
    initialGroceries: [oldPlanned],
    generatedForDates: () => [{
      id: "new-beans", source: "meal-plan", ingredientKey: "beans", text: { en: "beans", es: "frijoles" },
      plannedQuantities: { es: 2 }, remainingQuantities: { es: 2 }, plannedUnits: { es: "latas" }, mealUses: [],
    }],
  });
  ui.previewAction("refresh-shopping");
  assert.match(elements.assistantPreview.innerHTML, /Cantidad: 0 latas → 2 latas/);
});

test("unmatched Ask stays on chips and does not write", async () => {
  const { ui, elements, calls } = harness();
  ui.bindAssistantControls();
  ui.openSheet("today");
  elements.assistantAskInput.value = "tell me a joke";
  await elements.assistantAskForm.dispatch("submit");
  assert.equal(ui.getPreview().kind, "ask-unmatched");
  assert.match(elements.assistantPreview.innerHTML, /Try the buttons above/);
  assert.equal(elements.assistantStatus.textContent, translations.en.assistantAskUnmatched);
  assert.equal(elements.assistantApply.hidden, true);
  assert.equal(calls.saveSchedule, 0);
  assert.equal(calls.saveGroceries, 0);
});

test("Apply shows a spinner and disables controls until save finishes", async () => {
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const { ui, elements } = harness({
    saveSchedule: () => pending,
  });
  ui.openSheet("plan");
  ui.previewAction("plan-next-week");
  const applying = ui.applyPreview();
  assert.equal(ui.isApplying(), true);
  assert.equal(elements.assistantSpinner.hidden, false);
  assert.equal(elements.assistantSpinner["aria-hidden"], "false");
  assert.equal(elements.assistantStatusRow["aria-busy"], "true");
  assert.equal(elements.assistantStatus["aria-busy"], "true");
  assert.equal(elements.assistantStatus.textContent, translations.en.assistantApplying);
  assert.equal(elements.assistantApply.disabled, true);
  assert.equal(elements.assistantAskInput.disabled, true);
  assert.equal(elements.assistantAskSubmit.disabled, true);
  assert.match(elements.assistantChips.innerHTML, /disabled/);
  finish(true);
  assert.equal(await applying, true);
  assert.equal(ui.isApplying(), false);
  assert.equal(elements.assistantSpinner.hidden, true);
});

test("Apply error keeps the message and hides the spinner", async () => {
  const { ui, elements } = harness({
    saveSchedule: async () => false,
  });
  ui.previewAction("plan-next-week");
  assert.equal(await ui.applyPreview(), false);
  assert.equal(ui.isApplying(), false);
  assert.equal(elements.assistantSpinner.hidden, true);
  assert.equal(elements.assistantStatus.textContent, translations.en.assistantApplyError);
  assert.equal(elements.assistantStatus.classList.contains("error"), true);
  assert.equal(elements.assistantAskSubmit.disabled, false);
});

test("stale shopping preview requires renewed confirmation and never saves unseen changes", async () => {
  let ingredient = "Tortillas";
  const { ui, calls, elements } = harness({
    generatedForDates: () => [{
      id: "g1", text: { en: ingredient }, source: "meal-plan", ingredientKey: ingredient.toLowerCase(),
      mealUses: [{ dateKey: "2026-09-07", mealSlot: "dinner", recipeId: "tacos" }],
    }],
  });
  ui.previewAction("refresh-shopping");
  ingredient = "Beans";
  assert.equal(await ui.applyPreview(), false);
  assert.equal(calls.saveGroceries, 0);
  assert.equal(calls.groceryWrites.length, 0);
  assert.match(elements.assistantStatus.textContent, /changed since this preview/);
  assert.equal(ui.getPreview().proposedItems[1].text.en, "Beans");
});

test("stale shopping input list invalidates confirmation even when the proposed output is unchanged", async () => {
  const manual = { id: "manual", text: { en: "Milk" }, source: "manual", checked: true };
  const addedElsewhere = {
    id: "planned-b", text: { en: "Beans" }, source: "meal-plan", ingredientKey: "beans",
    mealUses: [{ dateKey: "2026-10-01", mealSlot: "dinner", recipeId: "chili" }],
  };
  const { ui, calls, setExternalGroceries } = harness({ initialGroceries: [manual] });
  ui.previewAction("refresh-shopping");
  setExternalGroceries([manual, addedElsewhere]);
  assert.equal(await ui.applyPreview(), false);
  assert.equal(calls.saveGroceries, 0);
  assert.equal(ui.getPreview().inputFingerprint.includes("planned:beans"), true);
});

test("shopping confirmation prevents duplicate saves and reports a save failure", async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const { ui, calls, elements } = harness({ saveGroceries: () => pending });
  ui.previewAction("refresh-shopping");
  const first = ui.applyPreview();
  const second = ui.applyPreview();
  assert.equal(await second, false);
  assert.equal(calls.saveGroceries, 1);
  finish(false);
  assert.equal(await first, false);
  assert.equal(elements.assistantStatus.textContent, translations.en.assistantApplyError);
});

test("new date controls stay disabled and cannot change the proposal while a save is pending", async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const { ui, elements, dispatchDocument } = harness({ saveGroceries: () => pending });
  ui.openSheet("today");
  ui.previewAction("refresh-shopping");
  const save = ui.applyPreview();
  assert.match(elements.assistantPreview.innerHTML, /data-assistant-shopping-edit-dates disabled/);
  await dispatchDocument("click", { target: { closest: (selector) => selector === "[data-assistant-shopping-edit-dates]" ? { disabled: true } : null } });
  assert.equal(ui.getPreview().kind, "shopping");
  finish(false);
  assert.equal(await save, false);
});

test("a failed shopping save keeps the same confirmation available for one finite retry", async () => {
  let shouldSave = false;
  const { ui, calls, elements } = harness({ saveGroceries: async () => shouldSave });
  ui.previewAction("refresh-shopping");
  assert.equal(await ui.applyPreview(), false);
  assert.equal(elements.assistantApply.hidden, false);
  assert.equal(elements.assistantApply.disabled, false);
  shouldSave = true;
  assert.equal(await ui.applyPreview(), true);
  assert.equal(calls.saveGroceries, 2);
});
