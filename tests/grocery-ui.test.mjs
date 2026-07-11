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
  return {
    hidden: false,
    innerHTML: "",
    textContent: "",
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
    "#restockPurchased": element(),
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
      movePurchasedHome: "Move purchased home",
      checkSection: "Check section",
      deleteSection: "Delete section",
      alreadyHave: "Already have",
      checkedOffSection: "Checked off",
      weekPlanSource: "Weekly menu",
      selectedRecipeSource: "Selected recipe",
      restockSource: "Restock",
      addOnsSection: "Add-ons",
      manualSource: "Manual",
      alreadyAtHomeLabel: "At home",
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
