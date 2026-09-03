import assert from "node:assert/strict";
import test from "node:test";

import { createRecipeLibraryUi } from "../recipe-library-ui.js";
import { textMatchesLanguage } from "../language-quality.js";

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
      await listeners.get(type)?.({
        target: this,
        preventDefault() {
          this.prevented = true;
        },
      });
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
    "#recipePicksList": element(),
    "#recipePicksEmpty": element({ hidden: true }),
    "#recipeList": element(),
    "#recipeSearch": element({ value: "" }),
    "#categoryFilter": element(),
    "#addRecipeToMealForm": element(),
    "#addRecipeToMealDate": element({ value: "" }),
    "#addRecipeToMealPeriod": element({ value: "dinner" }),
    "#addRecipeToMealSubmit": element({ disabled: false }),
    "#addRecipeToMealStatus": element(),
    "#recipePicksSection": element({ hidden: false }),
    "#closeRecipeDetail": element(),
    "#editRecipeForm": element(),
    "#detailName": element(),
    "#detailMeta": element(),
    "#allergyWarning": element(),
    "#recipeTranslationPanel": element(),
    "#recipeTranslationStatus": element(),
    "#translateSelectedRecipe": element(),
    "#ingredientList": element(),
    "#stepList": element(),
    "#familyNotes": element(),
    "#photoStrip": element(),
    "#favoriteRecipe": element(),
    "#publishDraftRecipe": element(),
    "#addRecipeGroceries": element(),
    "#markCooked": element(),
    "#recipeSafetyLockReason": element(),
    "#recipeDetail": element(),
    "#recipeMoreActions": element({ open: false }),
    "#recipesView": element(),
  };

  const ui = createRecipeLibraryUi({
    $: (selector) => elements[selector],
    $$: (selector) => selector === "[data-open]" ? overrides.openButtons || [] : [],
    t: (key) => ({
      recipeCount: "{count} recipes",
      recipeCountFiltered: "Showing {count} of {total}",
    })[key] || key,
    escapeHtml,
    localize: (value) => {
      if (typeof value === "string") return value;
      const currentLang = overrides.lang || "en";
      return value?.[currentLang] || value?.[currentLang === "es" ? "en" : "es"] || "";
    },
    localizeExact: (value) => {
      const text = typeof value === "string"
      ? (overrides.lang || "en") === "en" ? value : ""
      : value?.[overrides.lang || "en"] || "";
      return textMatchesLanguage(text, overrides.lang || "en") ? text : "";
    },
    categoryFor: () => "main",
    categoryLabel: () => "Main",
    getLang: () => overrides.lang || "en",
    getFavorites: () => [],
    getPlannedRecipeIds: () => overrides.plannedRecipeIds || [],
    allRecipes: () => overrides.recipes || [recipe],
    recipeById: overrides.recipeById || (() => recipe),
    draftById: () => null,
    getSelectedRecipeId: () => overrides.selectedRecipeId || recipe.id,
    setSelectedRecipeId: () => {},
    getRecipeSearch: () => overrides.search || "",
    setRecipeSearch: () => {},
    getCategoryFilter: () => "all",
    setCategoryFilter: () => {},
    setDetailStatus: () => {},
    isRecipeTranslationPending: () => Boolean(overrides.translationPending),
    getRecipeCatalogStatus: () => overrides.catalogStatus || "ready",
    setView: () => {},
    calendarMealForDateKey: overrides.calendarMealForDateKey || (() => ({ items: [] })),
    getCalendarMeals: () => overrides.calendarMeals || {},
    setCalendarMeals: (next) => {
      overrides.calendarMeals = next;
    },
    saveSchedule: overrides.saveSchedule || (async () => true),
    render: overrides.render || (() => {}),
  });

  return { elements, ui, overrides };
}

test("renderRecipes escapes recipe ids and photo URLs in card markup", () => {
  const { elements, ui } = harness();

  ui.renderRecipes();

  assert.match(elements["#recipeList"].innerHTML, /photo\.jpg&quot; onerror=&quot;alert\(1\)/);
  assert.match(elements["#recipeList"].innerHTML, /recipe-1&quot; autofocus=&quot;true/);
  assert.doesNotMatch(elements["#recipeList"].innerHTML, /onerror="alert/);
});

test("renderRecipes puts planned recipes in the family picks shelf", () => {
  const { elements, ui } = harness({ plannedRecipeIds: ['recipe-1" autofocus="true'] });

  ui.renderRecipes();

  assert.match(elements["#recipePicksList"].innerHTML, /recipe-pick-label/);
  assert.match(elements["#recipePicksList"].innerHTML, /recipe-1&quot; autofocus=&quot;true/);
  assert.equal(elements["#recipePicksEmpty"].hidden, true);
});

test("renderRecipes keeps the picks shelf empty when there are no favorites or plans", () => {
  const { elements, ui } = harness();

  ui.renderRecipes();

  assert.equal(elements["#recipePicksList"].innerHTML, "");
  assert.equal(elements["#recipePicksEmpty"].hidden, false);
});

test("catalog loading, unavailable, and genuinely empty states remain distinct", () => {
  const loading = harness({ catalogStatus: "loading", recipes: [] });
  loading.ui.renderRecipes();
  assert.match(loading.elements["#recipeList"].innerHTML, /recipeCatalogLoading/);
  assert.match(loading.elements["#recipeList"].innerHTML, /data-retry-recipe-catalog/);

  const unavailable = harness({ catalogStatus: "unavailable", recipes: [] });
  unavailable.ui.renderRecipes();
  assert.match(unavailable.elements["#recipeList"].innerHTML, /recipeCatalogUnavailable/);
  assert.doesNotMatch(unavailable.elements["#recipeList"].innerHTML, /recipeCatalogEmpty/);

  const empty = harness({ catalogStatus: "ready", recipes: [] });
  empty.ui.renderRecipes();
  assert.match(empty.elements["#recipeList"].innerHTML, /recipeCatalogEmpty/);
  assert.match(empty.elements["#recipeList"].innerHTML, /recipeCatalogEmptyNote/);
  assert.doesNotMatch(empty.elements["#recipeList"].innerHTML, /noMatchingRecipes/);
});

test("renderDetail tolerates an empty Blob catalog while recipes are loading", () => {
  const { elements, ui } = harness({
    recipes: [],
    selectedRecipeId: "",
    recipeById: () => null,
    catalogStatus: "loading",
  });

  ui.renderDetail();

  assert.equal(elements["#recipeDetail"].hidden, true);
  assert.equal(elements["#recipesView"].classList.values.has("detail-open"), false);
});

test("a loaded household catalog reports and renders every returned recipe", () => {
  const recipes = Array.from({ length: 60 }, (_, index) => ({
    id: `shared-${index}`,
    name: { en: `Recipe ${index}` },
    category: "main",
    ingredients: { en: ["ingredient"] },
    steps: { en: ["step"] },
    notes: { en: "" },
  }));
  const { elements, ui } = harness({ recipes });
  ui.renderRecipes();
  assert.equal((elements["#recipeList"].innerHTML.match(/class="recipe-card/g) || []).length, 60);
  assert.match(elements["#recipeCount"].textContent, /60/);
});

test("Spanish recipe search includes source-language fallback text", () => {
  const { elements, ui } = harness({
    lang: "es",
    search: "recipe",
    recipe: {
      name: { en: "Recipe" },
      meta: { en: "English source" },
      short: { en: "Family favorite" },
    },
  });

  ui.renderRecipes();

  assert.match(elements["#recipeList"].innerHTML, /<h3>Recipe<\/h3>/);
  assert.doesNotMatch(elements["#recipeList"].innerHTML, /noMatchingRecipes/);
});

test("renderDetail escapes photo URLs in detail markup", () => {
  const { elements, ui } = harness();

  ui.renderDetail();

  assert.match(elements["#photoStrip"].innerHTML, /photo\.jpg&quot; onerror=&quot;alert\(1\)/);
  assert.doesNotMatch(elements["#photoStrip"].innerHTML, /onerror="alert/);
});

test("photo-less recipes stay typographic instead of showing generic food art", () => {
  const { elements, ui } = harness({
    recipe: {
      photos: [],
      cardPhoto: "assets/recipe-card-placeholder.webp",
      cardPhotoIsPlaceholder: true,
    },
  });

  ui.renderRecipes();
  ui.renderDetail();

  assert.match(elements["#recipeList"].innerHTML, /recipe-card no-media/);
  assert.doesNotMatch(elements["#recipeList"].innerHTML, /data:image\/svg\+xml,/);
  assert.doesNotMatch(elements["#recipeList"].innerHTML, /<img/);
  assert.equal(elements["#photoStrip"].innerHTML, "");
});

test("compact recipes advertise lazy real-photo hydration without embedding media", () => {
  const { elements, ui } = harness({
    recipe: {
      photos: [],
      cardPhoto: "",
      hasSourcePhotos: true,
    },
  });

  ui.renderRecipes();

  assert.match(elements["#recipeList"].innerHTML, /data-recipe-photo-id=/);
  assert.doesNotMatch(elements["#recipeList"].innerHTML, /data:image\/svg\+xml,/);
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
  assert.equal(elements["#recipesView"].classList.values.has("detail-open"), true);

  await elements["#closeRecipeDetail"].dispatch("click");
  assert.equal(elements["#recipeDetail"].hidden, true);
  assert.equal(card.focused, true);
  assert.equal(elements["#recipesView"].classList.values.has("detail-open"), false);
});

test("Spanish detail uses source content while global translation is prepared", () => {
  const { elements, ui } = harness({ lang: "es" });

  ui.renderDetail();

  assert.equal(elements["#detailName"].textContent, "Recipe");
  assert.match(elements["#ingredientList"].innerHTML, />one</);
  assert.match(elements["#stepList"].innerHTML, />cook</);
  assert.equal(elements["#addRecipeGroceries"].disabled, false);
  assert.equal(elements["#markCooked"].disabled, false);
  assert.equal(elements["#recipeTranslationPanel"].hidden, false);
  assert.match(elements["#recipeTranslationStatus"].textContent, /translationFallbackDetail/);
});

test("global recipe translation shows a pending status without a second action", () => {
  const { elements, ui } = harness({ lang: "es", translationPending: true });

  ui.renderDetail();

  assert.equal(elements["#recipeTranslationPanel"].hidden, false);
  assert.equal(elements["#recipeTranslationStatus"].textContent, "translatingRecipe");
});

test("complete translated recipe does not show translation controls", () => {
  const { elements, ui } = harness({
    lang: "es",
    recipe: {
      name: { en: "Recipe", es: "Receta" },
      meta: { en: "Meta", es: "Detalle" },
      short: { en: "Short", es: "Breve" },
      ingredients: { en: ["one"], es: ["uno"] },
      steps: { en: ["cook"], es: ["cocinar"] },
      notes: { en: "note", es: "nota" },
    },
  });

  ui.renderDetail();

  assert.equal(elements["#recipeTranslationPanel"].hidden, true);
});

test("searching hides family picks so results are immediate", () => {
  const { elements, ui } = harness({ search: "chicken" });
  ui.renderRecipes();
  assert.equal(elements["#recipePicksSection"].hidden, true);
});

test("adding a recipe to a meal writes the calendar and saves the plan", async () => {
  let saved = 0;
  let rendered = 0;
  const { elements, ui, overrides } = harness({
    calendarMeals: {},
    calendarMealForDateKey: () => ({ items: [] }),
    saveSchedule: async () => {
      saved += 1;
      return true;
    },
    render: () => {
      rendered += 1;
    },
  });
  elements["#addRecipeToMealDate"].value = "2026-09-03";
  elements["#addRecipeToMealPeriod"].value = "dinner";
  ui.bindLibraryControls();

  await elements["#addRecipeToMealForm"].dispatch("submit");

  assert.equal(saved, 1);
  assert.equal(rendered, 1);
  assert.equal(overrides.calendarMeals["2026-09-03"].items[0].recipeId, `recipe-1" autofocus="true`);
  assert.equal(overrides.calendarMeals["2026-09-03"].items[0].period, "dinner");
  assert.match(elements["#addRecipeToMealStatus"].textContent, /addRecipeToMealSaved/);
});

test("missing Spanish safety warning keeps cooking actions disabled", () => {
  const { elements, ui } = harness({
    lang: "es",
    recipe: {
      name: { en: "Recipe", es: "Receta" },
      ingredients: { en: ["one"], es: ["uno"] },
      steps: { en: ["cook"], es: ["cocinar"] },
      allergyWarning: { en: "Contains nuts" },
    },
  });

  ui.renderDetail();

  assert.equal(elements["#allergyWarning"].textContent, "Contains nuts");
  assert.equal(elements["#addRecipeGroceries"].disabled, true);
  assert.equal(elements["#addRecipeToMealSubmit"].disabled, true);
  assert.equal(elements["#markCooked"].disabled, true);
  assert.equal(elements["#recipeTranslationPanel"].hidden, false);
  assert.equal(elements["#recipeSafetyLockReason"].hidden, false);
  assert.match(elements["#recipeSafetyLockReason"].textContent, /safetyActionsLocked/);
});
