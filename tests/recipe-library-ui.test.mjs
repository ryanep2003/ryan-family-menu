import assert from "node:assert/strict";
import test from "node:test";

import { createRecipeLibraryUi } from "../recipe-library-ui.js";

function element(initial = {}) {
  const listeners = new Map();
  return {
    hidden: false,
    innerHTML: "",
    textContent: "",
    attributes: {},
    classList: {
      values: new Set(),
      add(name) {
        this.values.add(name);
      },
      remove(name) {
        this.values.delete(name);
      },
      toggle(name, force) {
        const shouldHave = force ?? !this.values.has(name);
        if (shouldHave) {
          this.add(name);
          return true;
        }
        this.remove(name);
        return false;
      },
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    async dispatch(type) {
      await listeners.get(type)?.();
    },
    focus() {
      this.focused = true;
    },
    scrollIntoView() {
      this.scrolled = true;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
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

function harness(overrides = {}) {
  const unsafePhoto = `photo.jpg" onerror="alert(1)`;
  const recipe = {
    id: `recipe-1" autofocus="true`,
    name: { en: "Recipe" },
    meta: { en: "Meta" },
    short: { en: "Short" },
    tags: { en: "Tag" },
    category: "main",
    ingredients: { en: ["one"] },
    steps: { en: ["cook"] },
    notes: { en: "note" },
    photos: [unsafePhoto],
    ...overrides.recipe,
  };
  const elements = {
    "#recipeCount": element(),
    "#recipeList": element(),
    "#recipeSearch": element(),
    "#categoryFilter": element(),
    "#closeRecipeDetail": element(),
    "#editRecipeForm": element(),
    "#detailName": element(),
    "#detailMeta": element(),
    "#allergyWarning": element(),
    "#ingredientList": element(),
    "#stepList": element(),
    "#familyNotes": element(),
    "#photoStrip": element(),
    "#favoriteRecipe": element(),
    "#publishDraftRecipe": element(),
    "#addRecipeGroceries": element(),
    "#recipeDetail": element(),
  };

  const ui = createRecipeLibraryUi({
    $: (selector) => elements[selector],
    $$: (selector) => selector === "[data-open]" ? overrides.openButtons || [] : [],
    t: (key) => key,
    escapeHtml,
    localize: (value) => typeof value === "string" ? value : value?.en || "",
    categoryFor: () => "main",
    categoryLabel: () => "Main",
    getLang: () => "en",
    getFavorites: () => [],
    allRecipes: () => [recipe],
    recipeById: () => recipe,
    draftById: () => null,
    getSelectedRecipeId: () => recipe.id,
    setSelectedRecipeId: () => {},
    getRecipeSearch: () => "",
    setRecipeSearch: () => {},
    getCategoryFilter: () => "all",
    setCategoryFilter: () => {},
    setDetailStatus: () => {},
    setView: () => {},
  });

  return { elements, ui };
}

test("renderRecipes escapes recipe ids and photo URLs in card markup", () => {
  const { elements, ui } = harness();

  ui.renderRecipes();

  assert.match(elements["#recipeList"].innerHTML, /photo\.jpg&quot; onerror=&quot;alert\(1\)/);
  assert.match(elements["#recipeList"].innerHTML, /recipe-1&quot; autofocus=&quot;true/);
  assert.doesNotMatch(elements["#recipeList"].innerHTML, /onerror="alert/);
});

test("renderDetail escapes photo URLs in detail markup", () => {
  const { elements, ui } = harness();

  ui.renderDetail();

  assert.match(elements["#photoStrip"].innerHTML, /photo\.jpg&quot; onerror=&quot;alert\(1\)/);
  assert.doesNotMatch(elements["#photoStrip"].innerHTML, /onerror="alert/);
});

test("renderDetail resets recipe edit mode when switching recipes or languages", () => {
  const { elements, ui } = harness();
  elements["#recipeDetail"].classList.add("editing");
  elements["#editRecipeForm"].hidden = false;

  ui.renderDetail();

  assert.equal(elements["#recipeDetail"].classList.values.has("editing"), false);
  assert.equal(elements["#editRecipeForm"].hidden, true);
});

test("opening and closing a recipe preserves predictable focus", async () => {
  const card = element({
    dataset: { open: "recipe-1" },
    closest(selector) {
      return selector === "#recipeList" ? this : null;
    },
  });
  const { elements, ui } = harness({ openButtons: [card] });
  ui.bindLibraryControls();
  ui.bindOpenButtons();

  await card.dispatch("click");
  assert.equal(elements["#recipeDetail"].scrolled, true);
  assert.equal(elements["#detailName"].focused, true);

  await elements["#closeRecipeDetail"].dispatch("click");
  assert.equal(elements["#recipeDetail"].hidden, true);
  assert.equal(card.focused, true);
});
