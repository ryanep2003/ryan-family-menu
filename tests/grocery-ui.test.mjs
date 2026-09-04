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
      groceryMealCountOne: "1 meal",
      groceryMealCountMany: "{count} meals",
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
      aisleProduce: "Produce",
      aisleDairy: "Dairy",
      aisleMeat: "Meat",
      aisleBakery: "Bakery",
      aisleFrozen: "Frozen",
      aislePantry: "Pantry",
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
      translateGroceryRecipe: "Translate recipe to Spanish",
      translatingGroceryRecipe: "Translating recipe",
      groceryTranslationError: "Could not translate this recipe",
      addSpanishTranslation: "Add Spanish",
      spanishTranslationLabel: "Spanish grocery name",
      spanishTranslationPlaceholder: "Spanish for {source}",
      saveTranslation: "Save translation",
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
    translateRecipe: overrides.translateRecipe,
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

  assert.match(elements["#groceryList"].innerHTML, /<strong>limones<\/strong>/);
  assert.match(elements["#groceryList"].innerHTML, /grocery-qty">4</);
  assert.match(elements["#groceryList"].innerHTML, /de aceite de oliva/);
  assert.match(elements["#groceryList"].innerHTML, /grocery-qty">1 taza</);
  assert.match(elements["#groceryList"].innerHTML, /grocery-item-row is-unchecked/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /4 lemons/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /Weekly menu/);
});

test("grocery items without the active language still show the authored name", () => {
  const { elements, ui } = harness({
    state: {
      groceries: [{ id: "manual", text: { en: "milk" }, checked: false, source: "manual", store: "any" }],
      recipes: [],
    },
  });

  ui.renderGroceries();

  assert.match(elements["#groceryList"].innerHTML, />milk</);
  assert.match(elements["#groceryList"].innerHTML, />Dairy</);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /Translation pending/);
});

test("English shopping lists show Spanish-only add-on names instead of a pending placeholder", () => {
  const { elements, ui } = harness({
    state: {
      lang: "en",
      groceries: [{ id: "manual-es", text: { es: "leche" }, checked: false, source: "manual", store: "any", recipeName: {} }],
      recipes: [],
    },
  });

  ui.renderGroceries();

  assert.match(elements["#groceryList"].innerHTML, />leche</);
  assert.match(elements["#groceryList"].innerHTML, />Dairy</);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /Translation pending/);
});

test("a valid Spanish grocery value wins even when the linked recipe is incomplete", () => {
  const { elements, ui } = harness({
    state: {
      groceries: [{
        id: "localized-row",
        text: { en: "1 teaspoon salt", es: "1 cucharadita de sal" },
        checked: false,
        source: "week-plan",
        store: "any",
        recipeId: "mixed-recipe",
      }],
      recipes: [{
        id: "mixed-recipe",
        name: { en: "Mixed recipe", es: "Receta mixta" },
        ingredients: { en: ["1 teaspoon salt", "1 tablespoon oil"], es: ["1 cucharadita de sal", "1 tablespoon oil"] },
      }],
    },
  });

  ui.renderGroceries();

  assert.match(elements["#groceryList"].innerHTML, /de sal/);
  assert.match(elements["#groceryList"].innerHTML, /grocery-qty">1 cucharadita</);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /Translation pending/);
});

test("legacy recipe rows map by ingredient identity after Spanish translation", () => {
  const { elements, ui } = harness({
    state: {
      groceries: [{
        id: "legacy-lemon",
        text: { en: "4 lemons" },
        ingredientKey: "lemon",
        checked: false,
        source: "week-plan",
        store: "any",
        recipeId: "single-lemon",
      }],
      recipes: [{
        id: "single-lemon",
        name: { en: "Lemon recipe", es: "Receta de limón" },
        ingredients: { en: ["1 lemon"], es: ["1 limón"] },
      }],
    },
  });

  ui.renderGroceries();

  assert.match(elements["#groceryList"].innerHTML, /<strong>limón<\/strong>/);
  assert.match(elements["#groceryList"].innerHTML, /grocery-qty">1</);
});

test("shopping rows omit recipe translation actions and instruction paste", () => {
  const { elements, ui } = harness({
    translateRecipe: async () => {},
    state: {
      groceries: [
        {
          id: "needs-translation",
          text: { en: "4 lemons" },
          checked: false,
          source: "week-plan",
          store: "any",
          recipeId: "needs-spanish",
        },
        {
          id: "header",
          text: { en: "Para ~4–6 filetes:" },
          checked: false,
          source: "meal-plan",
          store: "any",
        },
        {
          id: "instruction",
          text: { en: "Dip each fillet in the egg, then coat with panko breadcrumbs until fully covered" },
          checked: false,
          source: "meal-plan",
          store: "any",
        },
        {
          id: "prepped",
          text: { en: "medium-large russet potato (peeled and chopped )" },
          checked: false,
          source: "meal-plan",
          store: "any",
        },
      ],
      recipes: [{
        id: "needs-spanish",
        name: { en: "Lemon recipe", es: "Receta de limón" },
        ingredients: { en: ["4 lemons"], es: [] },
      }],
    },
  });

  ui.renderGroceries();

  assert.match(elements["#groceryList"].innerHTML, /<strong>limones<\/strong>/);
  assert.match(elements["#groceryList"].innerHTML, /<strong>russet potato<\/strong>/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /data-translate-grocery-recipe/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /Traducir receta|Translate recipe/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /Para ~4/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /filetes/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /Dip each fillet/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /peeled and chopped/);
});

test("shopping list keeps the end-of-trip action visible while items remain", () => {
  const { elements, state, ui } = harness();

  ui.renderGroceries();
  assert.equal(elements["#finishShoppingPrompt"].hidden, false);
  assert.equal(elements["#restockPurchased"].textContent, "Finish shopping");

  state.groceries[0].checked = true;
  ui.renderGroceries();
  assert.equal(elements["#finishShoppingPrompt"].hidden, false);
  assert.equal(elements["#restockPurchased"].textContent, "Finish shopping (1)");
  assert.match(elements["#groceryList"].innerHTML, /grocery-item-row is-checked/);
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

test("renderGroceries keeps shared meal provenance collapsed until expanded", () => {
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

  assert.match(elements["#groceryList"].innerHTML, /<summary>2 meals<\/summary>/);
  assert.match(elements["#groceryList"].innerHTML, /Cena/);
  assert.match(elements["#groceryList"].innerHTML, /Almuerzo/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /Pollo al limon/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /4 servings/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /cook 1×/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /cook 0.5×/);
  assert.equal(elements["#groceryMealFilterPanel"].hidden, false);
  assert.match(elements["#groceryMealFilter"].innerHTML, /2026-07-20::dinner/);
});

test("a single planned meal shows a compact date and slot without recipe prose", () => {
  const { elements, ui } = harness({
    state: {
      groceries: [{
        id: "one-meal",
        text: { en: "**crushed red pepper**", es: "**crushed red pepper**" },
        checked: false,
        store: "any",
        source: "meal-plan",
        mealUses: [{
          dateKey: "2026-09-03",
          mealSlot: "lunch",
          recipeId: "skewers",
          recipeName: { en: "Yogurt Marinated Grilled Chicken Skewers" },
          servings: 3,
          batches: 0.5,
        }],
      }],
      recipes: [],
    },
  });

  ui.renderGroceries();

  assert.match(elements["#groceryList"].innerHTML, /<strong>crushed red pepper<\/strong>/);
  assert.match(elements["#groceryList"].innerHTML, /item-meal-note/);
  assert.match(elements["#groceryList"].innerHTML, /Almuerzo/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /Yogurt Marinated/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /3 servings/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /cook 0.5×/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /grocery-meal-meta/);
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

  assert.match(elements["#groceryList"].innerHTML, /limones/);
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

  assert.match(elements["#groceryList"].innerHTML, /limones/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /4 lemons/);
});

test("mixed-language Spanish recipe lists keep a usable ingredient name", () => {
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

  assert.match(elements["#groceryList"].innerHTML, /chili powder/);
  assert.doesNotMatch(elements["#groceryList"].innerHTML, /Translation pending/);
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
