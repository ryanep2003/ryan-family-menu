import assert from "node:assert/strict";
import test from "node:test";

import { createRecipeFormUi } from "../recipe-form-ui.js";

function element(initial = {}) {
  const listeners = new Map();
  return {
    value: "",
    files: [],
    hidden: false,
    disabled: false,
    textContent: "",
    innerHTML: "",
    classList: {
      added: [],
      removed: [],
      add(name) {
        this.added.push(name);
      },
      remove(name) {
        this.removed.push(name);
      },
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    async dispatch(type) {
      const event = { preventDefault() {} };
      for (const listener of listeners.get(type) || []) {
        await listener(event);
      }
    },
    reset() {
      this.resetCalled = true;
    },
    scrollIntoView() {
      this.scrolled = true;
    },
    ...initial,
  };
}

function harness(overrides = {}) {
  const elements = {
    "#editRecipe": element(),
    "#cancelRecipeEdit": element(),
    "#editPhotoInput": element(),
    "#editRecipeForm": element({ hidden: true }),
    "#editRecipeForm .primary-action": element(),
    "#deleteRecipe": element(),
    "#photoInput": element(),
    "#importRecipeUrl": element(),
    "#uploadForm": element(),
    "#uploadForm .primary-action": element(),
    "#uploadStatus": element(),
    "#nameInput": element(),
    "#categoryInput": element(),
    "#ingredientsInput": element(),
    "#stepsInput": element(),
    "#allergyInput": element(),
    "#noteInput": element(),
    "#recipeUrlInput": element(),
    "#editNameInput": element(),
    "#editCategoryInput": element(),
    "#editIngredientsInput": element(),
    "#editStepsInput": element(),
    "#editAllergyInput": element(),
    "#editNoteInput": element(),
    "#editPhotoPreview": element(),
    "#recipeDetail": element(),
    "#sharedStateStatus": element(),
  };
  const state = {
    selectedRecipeId: "recipe-1",
    favorites: ["recipe-1", "other"],
    importedRecipePhotos: [],
    edits: {},
    deleted: [],
    drafts: [],
    sharedRecipes: [],
    saveSharedStateCalls: 0,
    renderCalls: 0,
    renderRecipesCalls: 0,
    updatedMealsFor: [],
    view: "",
    statuses: [],
    ...overrides.state,
  };
  const currentRecipe = overrides.currentRecipe || {
    id: "recipe-1",
    name: { en: "Old recipe" },
    category: "side",
    ingredients: { en: ["old ingredient"] },
    steps: { en: ["old step"] },
    notes: { en: "old notes" },
    photos: ["existing.jpg"],
  };
  const recipes = overrides.recipes || [currentRecipe, { id: "backup" }];

  const ui = createRecipeFormUi({
    $: (selector) => elements[selector],
    t: (key) => ({
      recipeUpdated: "Recipe updated.",
      sharedRecipeError: "Could not save.",
      deleteRecipeConfirm: "Delete?",
      recipeDeleted: "Recipe deleted.",
      recipeScanWorking: "Reading...",
      recipeScanSaved: "Scanned.",
      recipeScanError: "Scan failed.",
      recipeUrlRequired: "Paste a URL.",
      recipeUrlWorking: "Reading URL...",
      recipeUrlSaved: "URL imported.",
      recipeUrlError: "URL failed.",
      savingRecipeLive: "Saving...",
      sharedRecipeSaved: "Saved.",
      localDraftSaved: "Draft saved.",
    }[key] || key),
    escapeHtml: (value) => `${value}`,
    localize: (value) => typeof value === "string" ? value : value?.en || "",
    recipeToEditableUpload: (recipe) => ({
      id: recipe.id,
      name: recipe.name?.en || "",
      category: recipe.category || "side",
      ingredientsText: recipe.ingredients?.en?.join("\n") || "",
      stepsText: recipe.steps?.en?.join("\n") || "",
      allergyWarning: "",
      notes: recipe.notes?.en || "",
      photos: recipe.photos || ["assets/meatballs-2.jpg"],
    }),
    readFilesAsDataUrls: overrides.readFilesAsDataUrls || (async (files) => files.length ? ["replacement.jpg"] : []),
    recognizeRecipe: overrides.recognizeRecipe || (async () => ({ name: "Scanned recipe" })),
    importRecipeUrl: overrides.importRecipeUrl || (async () => ({ name: "Imported recipe", photos: ["url.jpg"] })),
    saveSharedRecipe: overrides.saveSharedRecipe || (async (recipe) => ({ recipe: { id: "shared-1", ...recipe } })),
    saveSharedState: async () => {
      state.saveSharedStateCalls += 1;
    },
    recipeById: (id) => recipes.find((recipe) => recipe.id === id) || null,
    allRecipes: () => recipes.filter((recipe) => !state.deleted.includes(recipe.id)),
    getSelectedRecipeId: () => state.selectedRecipeId,
    setSelectedRecipeId: (id) => {
      state.selectedRecipeId = id;
    },
    setRecipeEdit: (id, edit) => {
      state.edits[id] = edit;
    },
    removeRecipeEdit: (id) => {
      delete state.edits[id];
    },
    removeDeletedRecipeId: (id) => {
      state.deleted = state.deleted.filter((deletedId) => deletedId !== id);
    },
    addDeletedRecipeId: (id) => {
      state.deleted = [...new Set([id, ...state.deleted])];
    },
    getFavorites: () => state.favorites,
    setFavorites: (favorites) => {
      state.favorites = favorites;
    },
    getImportedRecipePhotos: () => state.importedRecipePhotos,
    setImportedRecipePhotos: (photos) => {
      state.importedRecipePhotos = photos;
    },
    prependSharedRecipe: (recipe) => {
      state.sharedRecipes.unshift(recipe);
    },
    prependDraft: (draft) => {
      state.drafts.unshift(draft);
    },
    persistDrafts: () => {
      state.persistedDrafts = true;
    },
    updateMealsAfterRecipeDelete: (id) => {
      state.updatedMealsFor.push(id);
    },
    setView: (view) => {
      state.view = view;
    },
    render: () => {
      state.renderCalls += 1;
    },
    renderRecipes: () => {
      state.renderRecipesCalls += 1;
    },
    setDetailStatus: (message, isError = false) => {
      state.statuses.push({ message, isError });
    },
  });

  ui.bind();
  return { elements, state };
}

test("recipe edit keeps existing photos when no replacement is selected", async () => {
  const { elements, state } = harness({
    readFilesAsDataUrls: async () => [],
  });
  elements["#editNameInput"].value = "Updated recipe";
  elements["#editCategoryInput"].value = "side";
  elements["#editIngredientsInput"].value = "carrots";
  elements["#editStepsInput"].value = "roast";
  elements["#editAllergyInput"].value = "";
  elements["#editNoteInput"].value = "family note";
  elements["#editPhotoInput"].files = [];

  await elements["#editRecipeForm"].dispatch("submit");

  assert.equal(state.edits["recipe-1"].name, "Updated recipe");
  assert.deepEqual(state.edits["recipe-1"].photos, ["existing.jpg"]);
  assert.equal(state.saveSharedStateCalls, 1);
});

test("recipe edit uses replacement photos when selected", async () => {
  const { elements, state } = harness({
    readFilesAsDataUrls: async () => ["new-photo.jpg"],
  });
  elements["#editNameInput"].value = "Updated recipe";
  elements["#editPhotoInput"].files = [{ name: "new.jpg" }];

  await elements["#editRecipeForm"].dispatch("submit");

  assert.deepEqual(state.edits["recipe-1"].photos, ["new-photo.jpg"]);
});

test("delete recipe clears related local state and meal references", async () => {
  const originalConfirm = globalThis.window?.confirm;
  globalThis.window = { confirm: () => true };
  try {
    const { elements, state } = harness({
      state: { favorites: ["recipe-1", "other"], edits: { "recipe-1": { name: "edit" } } },
    });

    await elements["#deleteRecipe"].dispatch("click");

    assert.deepEqual(state.deleted, ["recipe-1"]);
    assert.equal(state.edits["recipe-1"], undefined);
    assert.deepEqual(state.favorites, ["other"]);
    assert.deepEqual(state.updatedMealsFor, ["recipe-1"]);
    assert.equal(state.selectedRecipeId, "backup");
    assert.equal(state.saveSharedStateCalls, 1);
  } finally {
    globalThis.window = { confirm: originalConfirm || (() => true) };
  }
});

test("URL import fills the add form and stores imported photos", async () => {
  const { elements, state } = harness({
    importRecipeUrl: async () => ({
      name: "URL pasta",
      category: "main",
      ingredientsText: "pasta",
      stepsText: "boil",
      notes: "quick",
      photos: ["url-photo.jpg"],
    }),
  });
  elements["#recipeUrlInput"].value = "https://example.com/recipe";

  await elements["#importRecipeUrl"].dispatch("click");

  assert.equal(elements["#nameInput"].value, "URL pasta");
  assert.equal(elements["#categoryInput"].value, "main");
  assert.equal(elements["#ingredientsInput"].value, "pasta");
  assert.deepEqual(state.importedRecipePhotos, ["url-photo.jpg"]);
});

test("failed live recipe save creates a local draft with imported photos", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  const { elements, state } = harness({
    state: { importedRecipePhotos: ["url-photo.jpg"] },
    readFilesAsDataUrls: async () => [],
    saveSharedRecipe: async () => {
      throw new Error("offline");
    },
  });
  elements["#nameInput"].value = "Draft soup";
  elements["#categoryInput"].value = "main";
  elements["#ingredientsInput"].value = "beans";
  elements["#stepsInput"].value = "simmer";

  try {
    await elements["#uploadForm"].dispatch("submit");

    assert.equal(state.drafts[0].name, "Draft soup");
    assert.deepEqual(state.drafts[0].photos, ["url-photo.jpg"]);
    assert.equal(state.persistedDrafts, true);
    assert.equal(state.renderRecipesCalls, 1);
  } finally {
    console.warn = originalWarn;
  }
});
