import assert from "node:assert/strict";
import test from "node:test";

import { cleanIngredientForGrocery, inventoryMatchFor } from "../grocery-logic.js";
import { createGroceryUi } from "../grocery-ui.js";

function escapeHtml(value) {
  return `${value || ""}`.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[character]));
}

function element() {
  const listeners = new Map();
  const classes = new Set();
  return {
    hidden: false,
    innerHTML: "",
    textContent: "",
    classList: {
      contains: (name) => classes.has(name),
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    async dispatch(type, target) {
      await listeners.get(type)?.({
        target,
        preventDefault() {
          this.prevented = true;
        },
      });
    },
  };
}

function harness(overrides = {}) {
  const elements = {
    "#groceryList": element(),
    "#groceryMealFilterPanel": element({ hidden: true }),
    "#groceryMealFilter": element(),
    "#restockPurchased": element(),
    "#finishShoppingPrompt": element(),
    body: element(),
    "#shoppingListSetup": element(),
  };
  const state = {
    lang: "es",
    saveCalls: 0,
    undo: null,
    groceries: [
      {
        id: "grocery-1",
        text: "4 lemons",
        checked: false,
        store: "any",
        source: "week-plan",
        recipeId: "lemon-chicken",
        recipeName: "Lemon Chicken",
      },
      {
        id: "grocery-2",
        text: "1 cup olive oil",
        checked: false,
        store: "any",
        source: "week-plan",
        recipeId: "lemon-chicken",
        recipeName: "Lemon Chicken",
      },
    ],
    inventory: [],
    recipes: [
      {
        id: "lemon-chicken",
        name: { en: "Lemon Chicken", es: "Pollo al limon" },
        ingredients: {
          en: ["4 lemons", "1 cup olive oil"],
          es: ["4 limones", "1 taza de aceite de oliva"],
        },
      },
    ],
    ...overrides.state,
  };

  const ui = createGroceryUi({
    $: (selector) => elements[selector],
    t: (key) => ({
      groceryEmpty: "Empty",
      groceryMealFilterEmpty: "No items for this meal",
      groceryMealFilterOption: "{date} · {meal}",
      groceryMealFilterHeading: "Shop by planned meal",
      groceryMealFilterLabel: "Planned meal",
      groceryAllMeals: "Everything on the list",
      groceryPlannedFor: "Planned meal details",
      groceryMealUse: "{date} · {meal} · {recipe}",
      groceryMealServings: "{count} servings",
      groceryMealBatches: "cook {count}×",
      groceryMealUseMore: "+{count} more planned meals",
      breakfastSlot: "Desayuno",
      lunchSlot: "Almuerzo",
      dinnerSlot: "Cena",
      movePurchasedHome: "Move purchased home",
      finishShopping: "Finish shopping",
      finishShoppingCount: "Finish shopping ({count})",
      checkSection: "Check section",
      deleteSection: "Delete section",
      alreadyHave: "Already have",
      checkedOffSection: "Checked off",
      weekPlanSource: "Weekly menu",
      multipleMealsSource: "Used across meals",
      spilloverFor: "Use across {count} meals: {meals}",
      selectedRecipeSource: "Selected recipe",
      restockSource: "Restock",
      addOnsSection: "Add-ons",
      manualSource: "Manual",
      alreadyAtHomeLabel: "At home",
      possibleAtHomeLabel: "Possible match at home",
      inventoryUpdatedOneDay: "updated 1 day ago",
      inventoryUpdatedDays: "updated {count} days ago",
      reviewInventoryMatch: "Review inventory match",
      keepOnList: "Keep on list",
      haveEnough: "Have enough",
      onShoppingList: "On shopping list",
      translationPendingShort: "Translation pending",
    }[key] || key),
    escapeHtml,
    cleanIngredientForGrocery,
    findInventoryMatch: inventoryMatchFor,
    getLang: () => state.lang,
    getGroceries: () => state.groceries,
    setGroceries: (groceries) => {
      state.groceries = groceries;
    },
    getInventory: () => state.inventory,
    allRecipes: () => state.recipes,
    localize: (value) => typeof value === "string" ? value : value?.[state.lang] || value?.en || "",
    groceryStoreLabel: () => "Any store",
    inventoryLocationLabel: (location) => location,
    saveGroceries: async () => {
      state.saveCalls += 1;
      return true;
    },
    offerUndo: (message, undo) => {
      state.undo = { message, undo };
    },
  });

  ui.bindGroceryControls();
  return { elements, state, ui };
}

function actionTarget(selector, sectionIds) {
  return {
    closest(requestedSelector) {
      if (requestedSelector !== selector) return null;
      return {
        dataset: selector === "[data-delete-grocery-section]"
          ? { deleteGrocerySection: sectionIds }
          : { checkGrocerySection: sectionIds },
      };
    },
  };
}

test("renderGroceries shows Spanish ingredient text under grocery items", () => {
  const { elements, ui } = harness();

  ui.renderGroceries();

  assert.match(elements["#groceryList"].innerHTML, /4 limones/);
  assert.match(elements["#groceryList"].innerHTML, /1 taza de aceite de oliva/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /4 lemons/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /Weekly menu/);
});

test("grocery items without the active language show a pending state", () => {
  const { elements, ui } = harness({
    state: {
      groceries: [{ id: "manual", text: { en: "milk" }, checked: false, source: "manual", store: "any" }],
      recipes: [],
    },
  });

  ui.renderGroceries();

  assert.match(elements["#groceryList"].innerHTML, /Translation pending/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, />milk</);
});

test("shopping list reveals the end-of-trip action after an item is checked", () => {
  const { elements, state, ui } = harness();

  ui.renderGroceries();
  assert.equal(elements["#finishShoppingPrompt"].hidden, true);
  assert.equal(elements["#restockPurchased"].textContent, "Finish shopping");

  state.groceries[0].checked = true;
  ui.renderGroceries();
  assert.equal(elements["#finishShoppingPrompt"].hidden, false);
  assert.equal(elements["#restockPurchased"].textContent, "Finish shopping (1)");
});

test("receipt matching prefers a checked purchase over an unchecked duplicate", () => {
  const { ui } = harness({
    state: {
      groceries: [
        { id: "unchecked", text: "lemons", checked: false, source: "manual", store: "any" },
        { id: "checked", text: "lemons", checked: true, source: "manual", store: "any" },
      ],
    },
  });

  assert.equal(ui.shoppingMatchForReceiptItem("lemons")?.id, "checked");
});

test("renderGroceries explains the meals, servings, and batches behind generated items", () => {
  const { elements, ui } = harness({
    state: {
      groceries: [{
        id: "spillover",
        text: { en: "cilantro", es: "cilantro" },
        checked: false,
        store: "any",
        source: "week-plan",
        mealUses: [
          { dateKey: "2026-07-20", mealSlot: "dinner", recipeId: "lemon-chicken", recipeName: { en: "Lemon Chicken" }, servings: 4, batches: 1 },
          { dateKey: "2026-07-22", mealSlot: "lunch", recipeId: "lemon-chicken", recipeName: { en: "Lemon Chicken" }, servings: 2, batches: 0.5 },
        ],
      }],
    },
  });

  ui.renderGroceries();

  assert.match(elements["#groceryList"].innerHTML, /Cena · Pollo al limon · 4 servings · cook 1×/);
  assert.match(elements["#groceryList"].innerHTML, /Almuerzo · Pollo al limon · 2 servings · cook 0.5×/);
  assert.equal(elements["#groceryMealFilterPanel"].hidden, false);
  assert.match(elements["#groceryMealFilter"].innerHTML, /2026-07-20::dinner/);
});

test("meal filter shows only groceries connected to the selected planned meal", async () => {
  const { elements, ui } = harness({
    state: {
      groceries: [
        {
          id: "dinner-lemons",
          text: { en: "4 lemons", es: "4 limones" },
          checked: false,
          store: "any",
          source: "meal-plan",
          recipeId: "lemon-chicken",
          mealUses: [{ dateKey: "2026-07-20", mealSlot: "dinner", recipeId: "lemon-chicken" }],
        },
        {
          id: "lunch-oil",
          text: { en: "1 cup olive oil", es: "1 taza de aceite de oliva" },
          checked: false,
          store: "any",
          source: "meal-plan",
          recipeId: "lemon-chicken",
          mealUses: [{ dateKey: "2026-07-22", mealSlot: "lunch", recipeId: "lemon-chicken" }],
        },
        { id: "manual", text: { es: "leche" }, checked: false, store: "any", source: "manual" },
      ],
    },
  });

  ui.showMeal("2026-07-20", "dinner");

  assert.match(elements["#groceryList"].innerHTML, /4 limones/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /aceite de oliva/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /leche/);
  assert.equal(elements["#groceryMealFilter"].value, "2026-07-20::dinner");

  elements["#groceryMealFilter"].value = "";
  await elements["#groceryMealFilter"].dispatch("change", elements["#groceryMealFilter"]);
  assert.match(elements["#groceryList"].innerHTML, /aceite de oliva/);
  assert.match(elements["#groceryList"].innerHTML, /leche/);
});

test("grocery recipe matching works from localized recipe names", () => {
  const { elements, ui } = harness({
    state: {
      groceries: [{
        id: "legacy",
        text: { en: "4 lemons" },
        checked: false,
        source: "week-plan",
        recipeName: { en: "Lemon Chicken" },
        store: "any",
      }],
    },
  });

  ui.renderGroceries();

  assert.match(elements["#groceryList"].innerHTML, /4 limones/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /4 lemons/);
});

test("mixed-language Spanish recipe lists stay pending", () => {
  const { elements, ui } = harness({
    state: {
      groceries: [{
        id: "mixed",
        text: { es: "2 tablespoons chili powder" },
        checked: false,
        source: "week-plan",
        recipeId: "mixed-recipe",
        store: "any",
      }],
      recipes: [{
        id: "mixed-recipe",
        name: { en: "Carnitas", es: "Carnitas" },
        ingredients: {
          en: ["salt", "oranges", "chili powder", "pork shoulder", "lard", "dark lager"],
          es: [
            "3 cucharadas de sal",
            "2 naranjas grandes",
            "2 tablespoons chili powder",
            "5 pounds boneless pork shoulder cut into large chunks",
            "1 cup lard",
            "2 bottles other dark lager",
          ],
        },
      }],
    },
  });

  ui.renderGroceries();

  assert.match(elements["#groceryList"].innerHTML, /Translation pending/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /chili powder/);
});

test("delete section removes every item in that grocery section", async () => {
  const { elements, state } = harness();

  await elements["#groceryList"].dispatch(
    "click",
    actionTarget("[data-delete-grocery-section]", "grocery-1|grocery-2")
  );

  assert.deepEqual(state.groceries, []);
  assert.equal(state.saveCalls, 1);
});

test("deleted grocery section can be restored", async () => {
  const { elements, state } = harness();

  await elements["#groceryList"].dispatch(
    "click",
    actionTarget("[data-delete-grocery-section]", "grocery-1|grocery-2")
  );
  await state.undo.undo();

  assert.equal(state.groceries.length, 2);
  assert.equal(state.saveCalls, 2);
});

test("check section marks every item in that grocery section", async () => {
  const { elements, state } = harness();

  await elements["#groceryList"].dispatch(
    "click",
    actionTarget("[data-check-grocery-section]", "grocery-1|grocery-2")
  );

  assert.equal(state.groceries.every((item) => item.checked), true);
  assert.equal(state.saveCalls, 1);
});

test("legacy inventory matches return to the active list for an explicit decision", async () => {
  const { elements, state, ui } = harness({
    state: {
      lang: "en",
      groceries: [{
        id: "legacy-match",
        text: { en: "4 lemons" },
        checked: true,
        inInventory: true,
        source: "manual",
        store: "any",
      }],
      inventory: [{ text: { en: "lemons" }, quantity: { en: "2 lemons" }, stockState: "some" }],
    },
  });

  ui.renderGroceries();
  assert.match(elements["#groceryList"].innerHTML, /Possible match at home/);
  assert.match(elements["#groceryList"].innerHTML, /Keep on list/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /type="checkbox"[^>]*checked/);
  assert.equal(ui.purchasedGroceries().length, 0);

  await elements["#groceryList"].dispatch("click", {
    closest(selector) {
      return selector === "[data-inventory-need]"
        ? { dataset: { inventoryNeed: "legacy-match" } }
        : null;
    },
  });

  assert.equal(state.groceries[0].inventoryDecision, "need");
  assert.equal(state.groceries[0].inInventory, false);
  assert.equal(state.groceries[0].checked, false);
});

test("a shopper can confirm an inventory match as already covered", async () => {
  const { elements, state } = harness({
    state: {
      groceries: [{
        id: "review-match",
        text: { en: "rice", es: "arroz" },
        checked: false,
        inInventory: false,
        inventorySuggested: true,
        inventoryDecision: "review",
        source: "manual",
        store: "any",
      }],
    },
  });

  await elements["#groceryList"].dispatch("click", {
    closest(selector) {
      return selector === "[data-inventory-have]"
        ? { dataset: { inventoryHave: "review-match" } }
        : null;
    },
  });

  assert.equal(state.groceries[0].inventoryDecision, "have");
  assert.equal(state.groceries[0].inInventory, true);
  assert.equal(state.groceries[0].checked, true);
});

test("renderGroceries escapes grocery ids in checkbox attributes", () => {
  const { elements, state, ui } = harness({
    state: {
      groceries: [
        {
          id: `grocery-1" autofocus="true`,
          text: "milk",
          checked: false,
          store: "any",
          source: "manual",
        },
      ],
    },
  });

  ui.renderGroceries();

  assert.match(elements["#groceryList"].innerHTML, /grocery-1&quot; autofocus=&quot;true/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /autofocus="true/);
  assert.equal(state.saveCalls, 0);
});
