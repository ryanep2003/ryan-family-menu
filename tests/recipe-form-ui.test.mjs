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
      values: new Set(),
      added: [],
      removed: [],
      add(name) {
        this.values.add(name);
        this.added.push(name);
      },
      remove(name) {
        this.values.delete(name);
        this.removed.push(name);
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
    focus() {
      this.focused = true;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    ...initial,
  };
}

function harness(overrides = {}) {
  const elements = {
    "#editRecipe": element(),
    "#cancelRecipeEdit": element(),
    "#editPhotoInput": element(),
    "#editPhotoCameraInput": element(),
    "#editRecipeForm": element({ hidden: true }),
    "#editRecipeForm .primary-action": element(),
    "#deleteRecipe": element(),
    "#photoInput": element(),
    "#photoCameraInput": element(),
    "#scanRecipePhotos": element(),
    "#clearRecipePhotos": element(),
    "#selectedRecipePhotoStatus": element(),
    "#importRecipeUrl": element(),
    "#saveRecipeDraft": element(),
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
    "#recipeDetailsDisclosure": element({ open: false }),
    "#usePhotoSource": element(),
    "#useUrlSource": element(),
    "#useManualSource": element(),
    "#photoSourcePanel": element(),
    "#urlSourcePanel": element({ hidden: true }),
    "#editNameInput": element(),
    "#editCategoryInput": element(),
    "#editIngredientsInput": element(),
    "#editStepsInput": element(),
    "#editAllergyInput": element(),
    "#editNoteInput": element(),
    "#editPhotoPreview": element(),
    "#recipeDetail": element(),
    "#recipeMoreActions": element({ open: false }),
    "#detailName": element(),
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
    sharedSaveCalls: 0,
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
    cardPhoto: "card-existing.jpg",
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
      scanRecipePhotos: "Read selected photos",
      clearRecipePhotos: "Clear photos",
      noRecipePhotosSelected: "No recipe photos selected.",
      recipePhotosSelected: "{count} selected.",
      recipeUrlRequired: "Paste a URL.",
      recipeUrlWorking: "Reading URL...",
      recipeUrlSaved: "URL imported.",
      recipeUrlError: "URL failed.",
      savingRecipeLive: "Saving...",
      sharedRecipeSaved: "Saved.",
      localDraftSaved: "Draft saved.",
      draftSaved: "Draft saved.",
      savingDraft: "Saving draft...",
      draftSaveError: "Draft save failed.",
      recipeNameRequired: "Name required.",
      recipePublishNeedsDetails: "Ingredients and steps required.",
      publishRecipe: "Publish.",
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
      cardPhoto: recipe.cardPhoto,
      photos: recipe.photos || [],
    }),
    readFilesAsDataUrls: overrides.readFilesAsDataUrls || (async (files) => files.length ? ["replacement.jpg"] : []),
    recognizeRecipe: overrides.recognizeRecipe || (async () => ({ name: "Scanned recipe" })),
    importRecipeUrl: overrides.importRecipeUrl || (async () => ({ name: "Imported recipe", photos: ["url.jpg"] })),
    saveSharedRecipe: overrides.saveSharedRecipe || (async (recipe) => {
      state.sharedSaveCalls += 1;
      return { recipe: { id: "shared-1", ...recipe } };
    }),
    saveSharedState: async () => {
      state.saveSharedStateCalls += 1;
    },
    getLang: () => "en",
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

  assert.deepEqual(state.edits["recipe-1"].name, { en: "Updated recipe" });
  assert.equal(state.edits["recipe-1"].cardPhoto, "card-existing.jpg");
  assert.deepEqual(state.edits["recipe-1"].photos, ["existing.jpg"]);
  assert.equal(state.saveSharedStateCalls, 1);
  assert.equal(elements["#editRecipeForm"].hidden, true);
});

test("recipe edit uses replacement photos when selected", async () => {
  const { elements, state } = harness({
    readFilesAsDataUrls: async () => ["new-photo.jpg"],
  });
  elements["#editNameInput"].value = "Updated recipe";
  elements["#editPhotoInput"].files = [{ name: "new.jpg" }];

  await elements["#editRecipeForm"].dispatch("submit");

  assert.deepEqual(state.edits["recipe-1"].photos, ["new-photo.jpg"]);
  assert.equal(state.edits["recipe-1"].cardPhoto, "new-photo.jpg");
});

test("edit recipe only shows the edit panel while editing", async () => {
  const { elements } = harness();

  await elements["#editRecipe"].dispatch("click");
  assert.equal(elements["#editRecipeForm"].hidden, false);
  assert.equal(elements["#recipeDetail"].classList.values.has("editing"), true);
  assert.equal(elements["#recipeDetail"].scrolled, true);
  assert.equal(elements["#editNameInput"].focused, true);

  await elements["#cancelRecipeEdit"].dispatch("click");
  assert.equal(elements["#editRecipeForm"].hidden, true);
  assert.equal(elements["#recipeDetail"].classList.values.has("editing"), false);
  assert.equal(elements["#editRecipe"].focused, true);
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
  assert.equal(elements["#recipeDetailsDisclosure"].open, true);
  assert.deepEqual(state.importedRecipePhotos, ["url-photo.jpg"]);
});

test("recipe source chooser shows one method and opens manual details", async () => {
  const { elements } = harness();

  await elements["#useUrlSource"].dispatch("click");
  assert.equal(elements["#photoSourcePanel"].hidden, true);
  assert.equal(elements["#urlSourcePanel"].hidden, false);
  assert.equal(elements["#useUrlSource"]["aria-pressed"], "true");

  await elements["#useManualSource"].dispatch("click");
  assert.equal(elements["#photoSourcePanel"].hidden, true);
  assert.equal(elements["#urlSourcePanel"].hidden, true);
  assert.equal(elements["#recipeDetailsDisclosure"].open, true);

  await elements["#usePhotoSource"].dispatch("click");
  assert.equal(elements["#photoSourcePanel"].hidden, false);
  assert.equal(elements["#recipeDetailsDisclosure"].open, false);
});

test("recipe photos are queued and scanned together on demand", async () => {
  const scannedBatches = [];
  const { elements } = harness({
    readFilesAsDataUrls: async (files) => files.map((file) => `data:${file.name}`),
    recognizeRecipe: async (images) => {
      scannedBatches.push(images);
      return {
        name: "Queued recipe",
        ingredientsText: "oil",
        stepsText: "cook",
      };
    },
  });

  elements["#photoInput"].files = [{ name: "page-1.jpg", size: 10, lastModified: 1 }];
  await elements["#photoInput"].dispatch("change");
  elements["#photoCameraInput"].files = [{ name: "page-2.jpg", size: 20, lastModified: 2 }];
  await elements["#photoCameraInput"].dispatch("change");

  assert.deepEqual(scannedBatches, []);
  assert.equal(elements["#selectedRecipePhotoStatus"].textContent, "2 selected.");
  assert.equal(elements["#scanRecipePhotos"].disabled, false);

  await elements["#scanRecipePhotos"].dispatch("click");

  assert.deepEqual(scannedBatches, [["data:page-1.jpg", "data:page-2.jpg"]]);
  assert.equal(elements["#nameInput"].value, "Queued recipe");
  assert.equal(elements["#stepsInput"].value, "cook");
  assert.equal(elements["#recipeDetailsDisclosure"].open, true);
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

    assert.deepEqual(state.drafts[0].name, { en: "Draft soup" });
    assert.deepEqual(state.drafts[0].photos, ["url-photo.jpg"]);
    assert.equal(state.persistedDrafts, true);
    assert.equal(state.renderRecipesCalls, 1);
  } finally {
    console.warn = originalWarn;
  }
});

test("failed live recipe save keeps selected queued photos in local draft", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  const { elements, state } = harness({
    readFilesAsDataUrls: async (files) => files.map((file) => `data:${file.name}`),
    saveSharedRecipe: async () => {
      throw new Error("offline");
    },
  });
  elements["#nameInput"].value = "Draft pasta";
  elements["#categoryInput"].value = "main";
  elements["#ingredientsInput"].value = "pasta";
  elements["#stepsInput"].value = "boil";
  elements["#photoInput"].files = [{ name: "page-1.jpg", size: 10, lastModified: 1 }];

  try {
    await elements["#photoInput"].dispatch("change");
    await elements["#uploadForm"].dispatch("submit");

    assert.deepEqual(state.drafts[0].name, { en: "Draft pasta" });
    assert.deepEqual(state.drafts[0].photos, ["data:page-1.jpg"]);
  } finally {
    console.warn = originalWarn;
  }
});

test("saving a draft keeps incomplete work local without publishing", async () => {
  const { elements, state } = harness();
  elements["#nameInput"].value = "Unfinished soup";
  elements["#categoryInput"].value = "main";

  await elements["#saveRecipeDraft"].dispatch("click");

  assert.equal(state.drafts.length, 1);
  assert.deepEqual(state.drafts[0].name, { en: "Unfinished soup" });
  assert.equal(state.drafts[0].ingredientsText, "");
  assert.equal(state.view, "recipes");
});

test("publishing requires ingredients and steps before contacting the shared site", async () => {
  const { elements, state } = harness();
  elements["#nameInput"].value = "Incomplete shared recipe";

  await elements["#uploadForm"].dispatch("submit");

  assert.equal(state.sharedSaveCalls, 0);
  assert.equal(elements["#recipeDetailsDisclosure"].open, true);
  assert.equal(elements["#uploadStatus"].textContent, "Ingredients and steps required.");
});
