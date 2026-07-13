import {
  cleanIngredientForGrocery,
  groceryItem,
  groceryItemsFromRecipe,
  inventoryMatchFor as findInventoryMatch,
  mergeGroceries,
} from "./grocery-logic.js";
import { bindInstallPrompt, registerServiceWorker } from "./app-lifecycle.js";
import {
  normalizeSharedState,
  persistSharedState,
  sharedStateSnapshot as familyStateSnapshot,
} from "./family-state.js";
import { createDashboardUi } from "./dashboard-ui.js";
import { inventoryItem, mergeInventory } from "./inventory-logic.js";
import { getJson, postJson, putJson } from "./api.js";
import { createGroceryUi } from "./grocery-ui.js";
import { cleanHouseholdMember } from "./household-attribution.js";
import { createInventoryUi } from "./inventory-ui.js";
import { readFilesAsDataUrls } from "./images.js";
import { localizedText, localizedTextExact, updateLocalizedText } from "./localized-data.js";
import { linesMatchLanguage, textMatchesLanguage } from "./language-quality.js";
import { createOnboardingUi } from "./onboarding-ui.js";
import { createRecipeFormUi } from "./recipe-form-ui.js";
import { createRecipeLibraryUi } from "./recipe-library-ui.js";
import { createReceiptUi } from "./receipt-ui.js";
import { recipes } from "./recipes-data.js";
import { createScheduleUi } from "./schedule-ui.js";
import { readJsonStorage, readNumberStorage, readStringStorage } from "./storage-utils.js";
import { formatSyncTime, renderSyncStatus } from "./sync-status.js";
import { translations } from "./translations.js";
import {
  applyVersionConflict,
  loadVersionedCollection,
  persistVersionedCollection,
  readVersionedCollectionStorage,
  saveVersionedCollection,
} from "./versioned-collection-client.js";
import {
  categoryFor,
  categoryLabel as localizedCategoryLabel,
  recipeById as findRecipeById,
  recipeToEditableUpload as recipeToEditable,
  uploadToRecipe,
  visibleRecipes,
} from "./recipe-utils.js";
import {
  activeWeekDateKeys as dateKeysForWeek,
  currentWeekStartKey,
  days,
  emptyMeal,
  handoffOptions,
  formatDateKey,
  mealHasContent,
  normalizeCalendar,
  normalizeMealPlan,
  normalizeSchedule,
  removeRecipeFromPlans,
} from "./schedule-utils.js";

const mealSlots = [
  { key: "main", label: "mainSlot", choose: "chooseMain", categories: ["main"] },
  { key: "side", label: "sideSlot", choose: "chooseSide", categories: ["side", "sauce"] },
  { key: "salad", label: "saladSlot", choose: "chooseSalad", categories: ["salad"] },
];

function supportedLang(value) {
  return Object.prototype.hasOwnProperty.call(translations, value) ? value : "en";
}

let lang = supportedLang(readStringStorage(localStorage, "dinner-lang", "en"));
let householdMember = cleanHouseholdMember(readStringStorage(localStorage, "dinner-household-member", "Family")) || "Family";
let selectedRecipeId = "meatballs";
let schedule = normalizeSchedule(readJsonStorage(localStorage, "dinner-schedule", null));
let calendarMeals = normalizeCalendar(readJsonStorage(localStorage, "dinner-calendar", {}));
let weekStartKey = readStringStorage(localStorage, "dinner-week-start", currentWeekStartKey());
let sharedStateVersion = readNumberStorage(localStorage, "dinner-state-version", 0);
let favorites = readJsonStorage(localStorage, "dinner-favorites", []);
let tasks = readJsonStorage(localStorage, "dinner-tasks", []);
let drafts = readJsonStorage(localStorage, "dinner-drafts", []);
let sharedRecipes = [];
let recipeEdits = readJsonStorage(localStorage, "dinner-recipe-edits", {});
let deletedRecipeIds = readJsonStorage(localStorage, "dinner-deleted-recipes", []);
let importedRecipePhotos = [];
let importedRecipeCardPhoto = "";
const groceryStorageKeys = { itemsKey: "dinner-groceries", versionKey: "dinner-grocery-version" };
const inventoryStorageKeys = { itemsKey: "dinner-inventory", versionKey: "dinner-inventory-version" };
const storedGroceries = readVersionedCollectionStorage(localStorage, groceryStorageKeys);
const storedInventory = readVersionedCollectionStorage(localStorage, inventoryStorageKeys);
let groceries = storedGroceries.items;
let groceryVersion = storedGroceries.version;
let inventory = storedInventory.items;
let inventoryVersion = storedInventory.version;
let inventorySuggestions = [];
let receiptSuggestions = [];
let inventoryMode = "shopping";
let inventoryFilter = "all";
let visibleMonth = new Date();
visibleMonth.setDate(1);
let recipeSearch = "";
let categoryFilter = "all";
let appUpdateNoticeShown = false;
const recipeTranslationInFlight = new Set();
const recipeTranslationFailed = new Set();
let recipeTranslationQueue = Promise.resolve();

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function t(key) {
  const messages = translations[lang] || translations.en;
  return messages[key] || translations.en[key] || key;
}

function formatItemActivity(item) {
  if (!item?.updatedBy || !item?.updatedAt) return "";
  const date = new Date(item.updatedAt);
  if (Number.isNaN(date.getTime())) return "";
  const time = new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return t("itemUpdatedBy").replace("{name}", item.updatedBy).replace("{time}", time);
}

function updateFileInputStatus(input) {
  const status = input ? $(`#${input.id}FileStatus`) : null;
  if (!status) return;
  const count = input.files?.length || 0;
  const key = count === 1 ? "oneFileSelected" : count > 1 ? "filesSelected" : "noFilesSelected";
  status.textContent = t(key).replace("{count}", count);
}

function renderFileInputStatuses() {
  $$('input[type="file"][data-file-action]').forEach(updateFileInputStatus);
}

function setupLocalizedFileInputs() {
  $$('input[type="file"][data-file-action]').forEach((input) => {
    if (input.closest(".localized-file-input")) return;
    const container = document.createElement("div");
    container.className = "localized-file-input";
    input.insertAdjacentElement("beforebegin", container);
    container.appendChild(input);
    const button = document.createElement("span");
    button.className = "file-picker-button";
    button.dataset.i18n = input.dataset.fileAction;
    button.textContent = t(input.dataset.fileAction);
    input.insertAdjacentElement("afterend", button);
    if (input.dataset.fileStatus !== "false") {
      const status = document.createElement("small");
      status.className = "file-picker-status";
      status.id = `${input.id}FileStatus`;
      button.insertAdjacentElement("afterend", status);
    }
    input.addEventListener("change", () => updateFileInputStatus(input));
  });
}

const syncAreas = {
  shared: { status: "#sharedStateStatus", retry: "#retrySharedState" },
  groceries: { status: "#groceryStatus", retry: "#retryGroceries" },
  inventory: { status: "#inventoryStatus", retry: "#retryInventory" },
};

function syncMessage(key, time = "") {
  const localizedTime = key === "syncedAt" && time
    ? formatSyncTime(lang, new Date(time))
    : time;
  return t(key).replace("{time}", localizedTime);
}

function setSyncStatus(area, key, { state = "success", canRetry = false, syncedAt = "" } = {}) {
  const elements = syncAreas[area];
  if (!elements) return;
  const status = $(elements.status);
  const retryButton = $(elements.retry);
  if (!status) return;
  status.dataset.syncKey = key;
  status.dataset.syncTime = syncedAt;
  status.dataset.syncState = state;
  status.dataset.syncRetry = canRetry ? "true" : "false";
  renderSyncStatus({
    status,
    retryButton,
    message: syncMessage(key, syncedAt),
    state,
    canRetry,
  });
}

function clearAreaStatus(area) {
  const elements = syncAreas[area];
  if (!elements) return;
  const status = $(elements.status);
  if (status) {
    delete status.dataset.syncKey;
    delete status.dataset.syncTime;
    delete status.dataset.syncState;
    delete status.dataset.syncRetry;
  }
  renderSyncStatus({ status, retryButton: $(elements.retry), message: "" });
}

function refreshSyncStatuses() {
  Object.entries(syncAreas).forEach(([area, elements]) => {
    const status = $(elements.status);
    if (!status?.dataset.syncKey) return;
    setSyncStatus(area, status.dataset.syncKey, {
      state: status.dataset.syncState,
      canRetry: status.dataset.syncRetry === "true",
      syncedAt: status.dataset.syncTime,
    });
  });
}

function markSynced(area) {
  setSyncStatus(area, "syncedAt", { syncedAt: new Date().toISOString() });
}

let undoTimer = 0;

function offerUndo(message, undo) {
  const toast = $("#undoToast");
  const action = $("#undoAction");
  if (!toast || !action) return;
  window.clearTimeout(undoTimer);
  $("#undoMessage").textContent = message;
  toast.hidden = false;
  action.onclick = async () => {
    window.clearTimeout(undoTimer);
    toast.hidden = true;
    await undo();
  };
  undoTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 7000);
}

function allRecipes() {
  return visibleRecipes({
    seedRecipes: recipes,
    sharedRecipes,
    drafts,
    recipeEdits,
    deletedRecipeIds,
    localize,
  });
}

function recipeById(id) {
  return findRecipeById(allRecipes(), id, recipes);
}

function draftById(id) {
  return drafts.find((draft) => draft.id === id) || null;
}

function persistDrafts() {
  localStorage.setItem("dinner-drafts", JSON.stringify(drafts));
}

function persistGroceriesLocally(items = groceries, version = groceryVersion) {
  persistVersionedCollection(localStorage, groceryStorageKeys, items, version);
}

function persistInventoryLocally(items = inventory, version = inventoryVersion) {
  persistVersionedCollection(localStorage, inventoryStorageKeys, items, version);
}

function recipeToEditableUpload(recipe) {
  return recipeToEditable(recipe, lang, localizeExact);
}

function rawRecipeById(id) {
  const stored = draftById(id)
    || recipeEdits[id]
    || sharedRecipes.find((recipe) => recipe.id === id)
    || null;
  if (stored) return stored;

  const seeded = recipes.find((recipe) => recipe.id === id);
  if (!seeded) return null;
  return {
    id: seeded.id,
    name: seeded.name,
    category: categoryFor(seeded),
    ingredientsText: {
      en: (seeded.ingredients?.en || []).join("\n"),
      es: (seeded.ingredients?.es || []).join("\n"),
    },
    stepsText: {
      en: (seeded.steps?.en || []).join("\n"),
      es: (seeded.steps?.es || []).join("\n"),
    },
    allergyWarning: seeded.allergyWarning,
    notes: seeded.notes,
    cardPhoto: seeded.cardPhoto,
    photos: seeded.photos,
  };
}

function rawRecipeText(value, locale) {
  return localizedTextExact(value, locale).trim();
}

function rawRecipeLines(value, locale) {
  return rawRecipeText(value, locale)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function recipeUploadFieldHasText(value) {
  if (typeof value === "string") return Boolean(value.trim());
  return Object.values(value || {}).some((entry) => typeof entry === "string" && entry.trim());
}

function recipeUploadHasRequiredContent(recipe) {
  return Boolean(
    recipe
    && recipeUploadFieldHasText(recipe.name)
    && recipeUploadFieldHasText(recipe.ingredientsText)
    && recipeUploadFieldHasText(recipe.stepsText)
  );
}

function rawRecipeHasLocale(recipe, locale) {
  if (!recipe) return false;
  const name = rawRecipeText(recipe.name, locale);
  const ingredients = rawRecipeLines(recipe.ingredientsText, locale);
  const steps = rawRecipeLines(recipe.stepsText, locale);
  if (!name || !textMatchesLanguage(name, locale)) return false;
  if (!ingredients.length || !linesMatchLanguage(ingredients, locale)) return false;
  if (!steps.length || !linesMatchLanguage(steps, locale)) return false;
  if (locale !== "es") return true;

  const opposite = "en";
  return ["allergyWarning", "notes"].every((field) => {
    const source = rawRecipeText(recipe[field], opposite);
    if (!source) return true;
    const translated = rawRecipeText(recipe[field], locale);
    return Boolean(translated && textMatchesLanguage(translated, locale));
  });
}

function rawRecipeNeedsLocale(recipe, locale) {
  if (!recipe) return false;
  return !rawRecipeHasLocale(recipe, locale);
}

function recipeTranslationSourceLang(recipe, targetLang) {
  const opposite = targetLang === "es" ? "en" : "es";
  if (rawRecipeHasLocale(recipe, opposite)) return opposite;
  if (rawRecipeHasLocale(recipe, targetLang)) return targetLang;
  return "";
}

function recipeToTranslationInput(recipe, sourceLang) {
  return {
    name: rawRecipeText(recipe?.name, sourceLang),
    category: recipe?.category || "draft",
    ingredientsText: rawRecipeText(recipe?.ingredientsText, sourceLang),
    stepsText: rawRecipeText(recipe?.stepsText, sourceLang),
    allergyWarning: rawRecipeText(recipe?.allergyWarning, sourceLang),
    notes: rawRecipeText(recipe?.notes, sourceLang),
    cardPhoto: recipe?.cardPhoto || "",
  };
}

function recipeToLocalizedEdit(recipe) {
  const name = {};
  const ingredientsText = {};
  const stepsText = {};
  const allergyWarning = {};
  const notes = {};

  const enName = rawRecipeText(recipe?.name, "en");
  const esName = rawRecipeText(recipe?.name, "es");
  const enIngredients = rawRecipeText(recipe?.ingredientsText, "en");
  const esIngredients = rawRecipeText(recipe?.ingredientsText, "es");
  const enSteps = rawRecipeText(recipe?.stepsText, "en");
  const esSteps = rawRecipeText(recipe?.stepsText, "es");
  const enWarning = rawRecipeText(recipe?.allergyWarning, "en");
  const esWarning = rawRecipeText(recipe?.allergyWarning, "es");
  const enNotes = rawRecipeText(recipe?.notes, "en");
  const esNotes = rawRecipeText(recipe?.notes, "es");

  if (enName) name.en = enName;
  if (esName) name.es = esName;
  if (enIngredients) ingredientsText.en = enIngredients;
  if (esIngredients) ingredientsText.es = esIngredients;
  if (enSteps) stepsText.en = enSteps;
  if (esSteps) stepsText.es = esSteps;
  if (enWarning) allergyWarning.en = enWarning;
  if (esWarning) allergyWarning.es = esWarning;
  if (enNotes) notes.en = enNotes;
  if (esNotes) notes.es = esNotes;

  return {
    id: recipe.id,
    name,
    category: recipe.category || "draft",
    ingredientsText,
    stepsText,
    allergyWarning,
    notes,
    cardPhoto: recipe?.cardPhoto || "",
    photos: recipe.photos || [],
    updatedAt: new Date().toISOString(),
  };
}

function mergeTranslatedRecipeEdit(recipe, translated, targetLang) {
  const base = recipeToLocalizedEdit(recipe);
  return {
    ...base,
    name: updateLocalizedText(base.name, translated.name, targetLang),
    ingredientsText: updateLocalizedText(base.ingredientsText, translated.ingredientsText, targetLang),
    stepsText: updateLocalizedText(base.stepsText, translated.stepsText, targetLang),
    allergyWarning: updateLocalizedText(base.allergyWarning, translated.allergyWarning, targetLang),
    notes: updateLocalizedText(base.notes, translated.notes, targetLang),
    updatedAt: new Date().toISOString(),
  };
}

function updateMealsAfterRecipeDelete(recipeId) {
  const updated = removeRecipeFromPlans(schedule, calendarMeals, recipeId, mealSlots.map((slot) => slot.key));
  schedule = updated.schedule;
  calendarMeals = updated.calendarMeals;
}

function localize(value) {
  return localizedText(value, lang);
}

function localizeExact(value) {
  const text = localizedTextExact(value, lang);
  return textMatchesLanguage(text, lang) ? text : "";
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

function categoryLabel(category) {
  return localizedCategoryLabel(category, localize);
}

function activeWeekDateKeys() {
  return dateKeysForWeek(weekStartKey);
}

function persistActiveWeekToCalendar() {
  const nextCalendarMeals = { ...calendarMeals };
  activeWeekDateKeys().forEach(({ key, dateKey }) => {
    // Keep one-day overrides separate from the recurring weekly plan.
    if (Object.prototype.hasOwnProperty.call(nextCalendarMeals, dateKey)) return;
    const meal = normalizeMealPlan(schedule[key]);
    if (mealHasContent(meal)) {
      nextCalendarMeals[dateKey] = meal;
    } else {
      delete nextCalendarMeals[dateKey];
    }
  });
  calendarMeals = normalizeCalendar(nextCalendarMeals);
}

function scheduleForWeek(startKey) {
  return normalizeSchedule(Object.fromEntries(
    dateKeysForWeek(startKey).map(({ key, dateKey }) => [
      key,
      calendarMeals[dateKey] || { ...emptyMeal },
    ])
  ));
}

async function navigateWeek(offset) {
  persistActiveWeekToCalendar();
  const nextStart = new Date(`${weekStartKey}T12:00:00`);
  nextStart.setDate(nextStart.getDate() + (offset * 7));
  weekStartKey = formatDateKey(nextStart);
  schedule = scheduleForWeek(weekStartKey);
  visibleMonth = new Date(`${weekStartKey}T12:00:00`);
  visibleMonth.setDate(1);
  render();
  await saveSharedState();
}

async function goToCurrentWeek() {
  if (weekStartKey === currentWeekStartKey()) return;
  persistActiveWeekToCalendar();
  weekStartKey = currentWeekStartKey();
  schedule = scheduleForWeek(weekStartKey);
  visibleMonth = new Date(`${weekStartKey}T12:00:00`);
  visibleMonth.setDate(1);
  render();
  await saveSharedState();
}

function rollWeekForwardIfNeeded() {
  const currentStart = currentWeekStartKey();
  if (weekStartKey === currentStart) return false;

  activeWeekDateKeys().forEach(({ key, dateKey }) => {
    const meal = normalizeMealPlan(schedule[key]);
    if (mealHasContent(meal) && !Object.prototype.hasOwnProperty.call(calendarMeals, dateKey)) {
      calendarMeals[dateKey] = meal;
    }
  });

  weekStartKey = currentStart;
  schedule = normalizeSchedule(Object.fromEntries(days.map((day) => [day.key, { ...emptyMeal }])));
  return true;
}

function weeklyMealForDateKey(dateKey) {
  const weekDate = activeWeekDateKeys().find((item) => item.dateKey === dateKey);
  return weekDate ? normalizeMealPlan(schedule[weekDate.key]) : { ...emptyMeal };
}

function calendarMealForDateKey(dateKey) {
  return Object.prototype.hasOwnProperty.call(calendarMeals, dateKey)
    ? normalizeMealPlan(calendarMeals[dateKey])
    : weeklyMealForDateKey(dateKey);
}

function sharedStateSnapshot() {
  return familyStateSnapshot({ weekStartKey, schedule, calendarMeals, favorites, tasks, recipeEdits, deletedRecipeIds });
}

function currentSharedState() {
  return { weekStartKey, schedule, calendarMeals, favorites, tasks, recipeEdits, deletedRecipeIds };
}

function applySharedState(nextState) {
  schedule = nextState.schedule;
  calendarMeals = nextState.calendarMeals;
  weekStartKey = nextState.weekStartKey || weekStartKey;
  favorites = nextState.favorites;
  tasks = nextState.tasks;
  recipeEdits = nextState.recipeEdits;
  deletedRecipeIds = nextState.deletedRecipeIds;
}

function saveSharedStateLocally() {
  persistSharedState(localStorage, currentSharedState(), sharedStateVersion);
}

async function saveSharedState() {
  saveSharedStateLocally();
  setSyncStatus("shared", "savedLocallySyncing", { state: "pending" });

  try {
    const data = await putJson(
      "/.netlify/functions/family-state",
      { state: sharedStateSnapshot(), version: sharedStateVersion },
      "Could not save shared family state."
    );
    sharedStateVersion = Number(data.version) || sharedStateVersion;
    if (data.state) {
      applySharedState(normalizeSharedState(data.state, currentSharedState()));
      saveSharedStateLocally();
    }
    markSynced("shared");
  } catch (error) {
    console.warn(error);
    if (error.status === 409 && error.data?.state) {
      sharedStateVersion = Number(error.data.version) || sharedStateVersion;
      applySharedState(normalizeSharedState(error.data.state, currentSharedState()));
      saveSharedStateLocally();
      render();
      setSyncStatus("shared", "sharedStateConflict", { state: "error" });
      return;
    }
    setSyncStatus("shared", "savedLocallyPending", { state: "pending", canRetry: true });
  }
}

async function loadSharedState() {
  try {
    const data = await getJson("/.netlify/functions/family-state", "Could not load shared family state.");
    sharedStateVersion = Number(data.version) || 0;

    if (!data.state) {
      rollWeekForwardIfNeeded();
      await saveSharedState();
      render();
      return;
    }

    const missingWeekStart = !data.state.weekStart;
    applySharedState(normalizeSharedState(data.state, {
      weekStartKey: currentWeekStartKey(),
      favorites: [],
      tasks: [],
      recipeEdits: {},
      deletedRecipeIds: [],
    }));
    const rolledForward = rollWeekForwardIfNeeded();
    saveSharedStateLocally();
    render();
    if (rolledForward || missingWeekStart) {
      await saveSharedState();
    } else {
      markSynced("shared");
    }
  } catch (error) {
    console.warn(error);
    setSyncStatus("shared", "usingSavedCopy", { state: "pending", canRetry: true });
  }
}

function todaysRecipeId() {
  return todaysMealPlan().main || "meatballs";
}

function mealRecipes(meal) {
  return mealSlots
    .map((slot) => ({
      ...slot,
      recipe: meal[slot.key] ? recipeById(meal[slot.key]) : null,
    }))
    .filter((item) => item.recipe);
}

function mealHasWarning(meal) {
  return mealRecipes(meal).some(({ recipe }) => recipe.allergyWarning);
}

function mealSummary(meal) {
  const items = mealRecipes(meal);
  if (!items.length) {
    return Object.values(meal.handoff || {}).some(Boolean) || localizedText(meal.notes, lang)
      ? t("handoffPlanned")
      : t("noMealSet");
  }
  return items.map(({ recipe }) => localizeExact(recipe.name) || t("translationPendingShort")).join(" · ");
}

function groceryStoreLabel(store) {
  if (store === "publix") return t("storePublix");
  if (store === "whole-foods") return t("storeWholeFoods");
  if (store === "costco") return t("storeCostco");
  return t("storeAny");
}

function inventoryMatchFor(text, includeDepleted = false) {
  return findInventoryMatch(inventory, text, includeDepleted);
}

function recipeGroceries(recipe, source = "recipe-detail") {
  return groceryItemsFromRecipe(recipe, lang, inventory, householdMember).map((item) => ({
    ...item,
    source,
  }));
}

function detailStatusMessage(key, replacements = {}) {
  return Object.entries(replacements).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, value),
    t(key),
  );
}

function setDetailStatus(message = "", isError = false) {
  const status = $("#detailStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function detailGroceriesMessage(addedCount, atHomeCount) {
  if (!addedCount) return t("recipeGroceriesNoNew");
  if (atHomeCount) {
    return detailStatusMessage("recipeGroceriesAddedWithHome", {
      count: addedCount,
      homeCount: atHomeCount,
    });
  }
  return detailStatusMessage("recipeGroceriesAdded", { count: addedCount });
}

function weeklyMealRecipes() {
  return days.flatMap((day) => mealRecipes(normalizeMealPlan(schedule[day.key])));
}

function generatedGroceriesFromWeek() {
  return weeklyMealRecipes().flatMap(({ recipe }) => recipeGroceries(recipe, "week-plan"));
}

function manualGroceryItemsFromText(text, store) {
  return text
    .split(/\n|,|;/)
    .map((item) => cleanIngredientForGrocery(item))
    .filter(Boolean)
    .map((item) => groceryItem(item, {
      store,
      source: "manual",
      lang,
      updatedBy: householdMember,
    }));
}

let inventoryUi;

function inventoryLocationLabel(location) {
  return inventoryUi.inventoryLocationLabel(location);
}

const groceryUi = createGroceryUi({
  $,
  t,
  escapeHtml,
  cleanIngredientForGrocery,
  findInventoryMatch,
  getLang: () => lang,
  getGroceries: () => groceries,
  setGroceries: (items) => {
    groceries = items;
  },
  getInventory: () => inventory,
  allRecipes,
  localize: localizeExact,
  groceryStoreLabel,
  inventoryLocationLabel,
  getHouseholdMember: () => householdMember,
  formatItemActivity,
  saveGroceries,
  offerUndo,
});

const renderGroceries = () => groceryUi.renderGroceries();
const bindGroceryControls = () => groceryUi.bindGroceryControls();
const purchasedGroceries = () => groceryUi.purchasedGroceries();
const shoppingMatchForReceiptItem = (text) => groceryUi.shoppingMatchForReceiptItem(text);
const inventoryShoppingNote = (item) => groceryUi.inventoryShoppingNote(item);

inventoryUi = createInventoryUi({
  $,
  $$,
  t,
  escapeHtml,
  groceryItem,
  inventoryItem,
  mergeInventory,
  inventoryShoppingNote,
  renderGroceries,
  bindGroceryControls,
  saveGroceries,
  saveInventory,
  offerUndo,
  getInventory: () => inventory,
  setInventory: (items) => {
    inventory = items;
  },
  getGroceries: () => groceries,
  setGroceries: (items) => {
    groceries = items;
  },
  getInventoryMode: () => inventoryMode,
  getInventoryFilter: () => inventoryFilter,
  getHouseholdMember: () => householdMember,
  formatItemActivity,
  getLang: () => lang,
  getInventorySuggestions: () => inventorySuggestions,
  setInventorySuggestions: (items) => {
    inventorySuggestions = items;
  },
});

const renderInventoryMode = () => inventoryUi.renderInventoryMode();
const renderInventory = () => inventoryUi.renderInventory();
const bindInventoryControls = () => inventoryUi.bindInventoryControls();
const renderInventorySuggestions = () => inventoryUi.renderInventorySuggestions();

const receiptUi = createReceiptUi({
  $,
  $$,
  t,
  escapeHtml,
  inventoryItem,
  mergeInventory,
  readFilesAsDataUrls,
  recognizeReceipt,
  shoppingMatchForReceiptItem,
  renderGroceries,
  bindGroceryControls,
  renderInventory,
  bindInventoryControls,
  saveGroceries,
  saveInventory,
  setGroceryStatus: (key, options) => setSyncStatus("groceries", key, options),
  clearGroceryStatus: () => clearAreaStatus("groceries"),
  getReceiptSuggestions: () => receiptSuggestions,
  setReceiptSuggestions: (items) => {
    receiptSuggestions = items;
  },
  getLang: () => lang,
  getHouseholdMember: () => householdMember,
  updateFileInputStatus,
  getInventory: () => inventory,
  setInventory: (items) => {
    inventory = items;
  },
  getGroceries: () => groceries,
  setGroceries: (items) => {
    groceries = items;
  },
});

const renderReceiptSuggestions = () => receiptUi.renderReceiptSuggestions();

function renderTranslations() {
  document.documentElement.lang = lang;
  $$("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  $$("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  $$("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });
  $$("[data-i18n-title]").forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
  });
  $$("[data-lang]").forEach((button) => {
    const active = button.dataset.lang === lang;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", `${active}`);
  });
  $$(".tabs button").forEach((button) => {
    if (button.classList.contains("active")) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  refreshSyncStatuses();
  if ($("#householdMemberInput")) $("#householdMemberInput").value = householdMember;
  renderFileInputStatuses();
}

function showAppUpdateNotice() {
  if (appUpdateNoticeShown) return;
  const notice = $("#appUpdateNotice");
  if (!notice) return;
  appUpdateNoticeShown = true;
  notice.hidden = false;
}

const dashboardUi = createDashboardUi({
  $,
  $$,
  t,
  escapeHtml,
  localize: (value) => localizeExact(value) || t("translationPendingShort"),
  formatDateKey,
  categoryFor,
  categoryLabel,
  mealRecipes,
  mealHasWarning,
  calendarMealForDateKey,
  recipeById,
  allRecipes,
  saveSharedState,
  offerUndo,
  render,
  renderDetail: () => {
    renderDetail();
    $("#recipesView").classList.add("detail-open");
  },
  setView,
  getLang: () => lang,
  getFavorites: () => favorites,
  getTasks: () => tasks,
  setTasks: (nextTasks) => {
    tasks = nextTasks;
  },
  getGroceries: () => groceries,
  getInventory: () => inventory,
  getCalendarMeals: () => calendarMeals,
  setCalendarMeals: (nextCalendarMeals) => {
    calendarMeals = normalizeCalendar(nextCalendarMeals);
  },
  handoffOptions,
  getSelectedRecipeId: () => selectedRecipeId,
  setSelectedRecipeId: (id) => {
    selectedRecipeId = id;
  },
});

const todaysMealPlan = () => dashboardUi.todaysMealPlan();
const renderToday = () => dashboardUi.renderToday();
const renderTasks = () => dashboardUi.renderTasks();
const renderFavorites = () => dashboardUi.renderFavorites();

const scheduleUi = createScheduleUi({
  $,
  $$,
  t,
  escapeHtml,
  localize: (value) => localizeExact(value) || t("translationPendingShort"),
  formatDateKey,
  normalizeMealPlan,
  mealSlots,
  handoffOptions,
  days,
  emptyMeal,
  categoryFor,
  activeWeekDateKeys,
  calendarMealForDateKey,
  mealHasContent,
  mealRecipes,
  mealHasWarning,
  mealSummary,
  recipeById,
  allRecipes,
  saveSharedState,
  render,
  getLang: () => lang,
  getSchedule: () => schedule,
  setSchedule: (nextSchedule) => {
    schedule = normalizeSchedule(nextSchedule);
  },
  getCalendarMeals: () => calendarMeals,
  setCalendarMeals: (nextCalendarMeals) => {
    calendarMeals = normalizeCalendar(nextCalendarMeals);
  },
  navigateWeek,
  goToCurrentWeek,
  getCurrentWeekStartKey: () => currentWeekStartKey(),
  getVisibleMonth: () => visibleMonth,
  setVisibleMonth: (month) => {
    visibleMonth = month;
  },
});

const renderSchedule = () => scheduleUi.renderSchedule();
const renderCalendar = () => scheduleUi.renderCalendar();

const recipeLibraryUi = createRecipeLibraryUi({
  $,
  $$,
  t,
  escapeHtml,
  localize,
  localizeExact,
  categoryFor,
  categoryLabel,
  getLang: () => lang,
  getFavorites: () => favorites,
  allRecipes,
  recipeById,
  draftById,
  getSelectedRecipeId: () => selectedRecipeId,
  setSelectedRecipeId: (id) => {
    selectedRecipeId = id;
  },
  getRecipeSearch: () => recipeSearch,
  setRecipeSearch: (search) => {
    recipeSearch = search;
  },
  getCategoryFilter: () => categoryFilter,
  setCategoryFilter: (filter) => {
    categoryFilter = filter;
  },
  setDetailStatus,
  setView,
});

const renderRecipes = () => recipeLibraryUi.renderRecipes();
const renderDetail = () => recipeLibraryUi.renderDetail();
const bindOpenButtons = () => recipeLibraryUi.bindOpenButtons();

const onboardingUi = createOnboardingUi({
  $,
  $$,
  storage: localStorage,
  setView,
  openInventory: () => {
    inventoryMode = "home";
    renderInventoryMode();
  },
});

function render() {
  renderTranslations();
  renderInventoryMode();
  renderToday();
  renderTasks();
  renderFavorites();
  renderSchedule();
  renderCalendar();
  renderGroceries();
  renderInventory();
  renderInventorySuggestions();
  renderRecipes();
  renderDetail();
  bindOpenButtons();
  bindGroceryControls();
  bindInventoryControls();
  queueRecipeBackfillForCurrentLanguage();
}

function setView(viewName) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `${viewName}View`));
  $$(".tabs button").forEach((button) => {
    const active = button.dataset.view === (viewName === "add" ? "recipes" : viewName);
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  const addButton = $("#globalAddRecipe");
  if (addButton) {
    const active = viewName === "add";
    addButton.classList.toggle("active", active);
    if (active) addButton.setAttribute("aria-current", "page");
    else addButton.removeAttribute("aria-current");
  }
  document.body.dataset.view = viewName;
  $("#recipeDetail").hidden = true;
  $("#recipesView").classList.remove("detail-open");
  if (viewName !== "today" && $("#quickGuide") && $("#quickGuideToggle")) {
    $("#quickGuide").hidden = true;
    $("#quickGuideToggle").setAttribute("aria-expanded", "false");
  }
}

async function loadSharedRecipes() {
  try {
    const data = await getJson("/.netlify/functions/recipes", "Could not load shared recipes.");
    sharedRecipes = Array.isArray(data.recipes) ? data.recipes : [];
    render();
  } catch (error) {
    console.warn(error);
  }
}

async function saveSharedRecipe(recipe) {
  return postJson("/.netlify/functions/recipes", recipe, t("sharedRecipeError"));
}

async function loadGroceries() {
  try {
    await loadVersionedCollection({
      getJson,
      url: "/.netlify/functions/groceries",
      fallbackMessage: "Could not load groceries.",
      setItems: (items) => {
        groceries = items;
      },
      setVersion: (version) => {
        groceryVersion = version;
      },
      persist: (items, version) => persistGroceriesLocally(items, version),
      render,
    });
    markSynced("groceries");
  } catch (error) {
    console.warn(error);
    setSyncStatus("groceries", "usingSavedCopy", { state: "pending", canRetry: true });
  }
}

async function saveGroceries() {
  setSyncStatus("groceries", "savedLocallySyncing", { state: "pending" });
  try {
    await saveVersionedCollection({
      putJson,
      url: "/.netlify/functions/groceries",
      fallbackMessage: "Could not save groceries.",
      items: groceries,
      version: groceryVersion,
      setItems: (items) => {
        groceries = items;
      },
      setVersion: (version) => {
        groceryVersion = version;
      },
      persist: (items, version) => persistGroceriesLocally(items, version),
    });
    markSynced("groceries");
    return true;
  } catch (error) {
    console.warn(error);
    if (applyVersionConflict(error, {
      setItems: (items) => {
        groceries = items;
      },
      setVersion: (version) => {
        groceryVersion = version;
      },
      currentVersion: groceryVersion,
      persist: (items, version) => persistGroceriesLocally(items, version),
    })) {
      renderGroceries();
      bindGroceryControls();
      setSyncStatus("groceries", "groceryConflict", { state: "error" });
      return false;
    }
    setSyncStatus("groceries", "savedLocallyPending", { state: "pending", canRetry: true });
    return false;
  }
}

async function loadInventory() {
  try {
    await loadVersionedCollection({
      getJson,
      url: "/.netlify/functions/inventory",
      fallbackMessage: "Could not load inventory.",
      setItems: (items) => {
        inventory = items;
      },
      setVersion: (version) => {
        inventoryVersion = version;
      },
      persist: (items, version) => persistInventoryLocally(items, version),
      render,
    });
    markSynced("inventory");
  } catch (error) {
    console.warn(error);
    setSyncStatus("inventory", "usingSavedCopy", { state: "pending", canRetry: true });
  }
}

async function saveInventory() {
  setSyncStatus("inventory", "savedLocallySyncing", { state: "pending" });
  try {
    await saveVersionedCollection({
      putJson,
      url: "/.netlify/functions/inventory",
      fallbackMessage: "Could not save inventory.",
      items: inventory,
      version: inventoryVersion,
      setItems: (items) => {
        inventory = items;
      },
      setVersion: (version) => {
        inventoryVersion = version;
      },
      persist: (items, version) => persistInventoryLocally(items, version),
    });
    markSynced("inventory");
    return true;
  } catch (error) {
    console.warn(error);
    if (applyVersionConflict(error, {
      setItems: (items) => {
        inventory = items;
      },
      setVersion: (version) => {
        inventoryVersion = version;
      },
      currentVersion: inventoryVersion,
      persist: (items, version) => persistInventoryLocally(items, version),
    })) {
      renderInventory();
      bindInventoryControls();
      setSyncStatus("inventory", "inventoryConflict", { state: "error" });
      return false;
    }
    setSyncStatus("inventory", "savedLocallyPending", { state: "pending", canRetry: true });
    return false;
  }
}

async function recognizeInventory(images, location) {
  const data = await postJson(
    "/.netlify/functions/recognize-inventory",
    { images, location, lang },
    "Could not scan inventory photos."
  );
  return Array.isArray(data.items) ? data.items : [];
}

async function recognizeRecipe(images) {
  const data = await postJson("/.netlify/functions/recognize-recipe", { images }, t("recipeScanError"));
  return data.recipe || {};
}

async function importRecipeUrl(url) {
  const data = await postJson("/.netlify/functions/import-recipe-url", { url }, t("recipeUrlError"));
  return data.recipe || {};
}

async function translateRecipeContent(recipe, sourceLang, targetLang) {
  const data = await postJson(
    "/.netlify/functions/translate-recipe",
    {
      recipe: recipeToTranslationInput(recipe, sourceLang),
      sourceLang,
      targetLang,
    },
    "Could not translate recipe."
  );
  return data.recipe || {};
}

async function backfillRecipeLocale(recipeId, targetLang) {
  const recipe = rawRecipeById(recipeId);
  if (!recipe || !rawRecipeNeedsLocale(recipe, targetLang)) return;

  const sourceLang = recipeTranslationSourceLang(recipe, targetLang);
  if (!sourceLang || sourceLang === targetLang) return;

  const translated = await translateRecipeContent(recipe, sourceLang, targetLang);
  const nextEdit = mergeTranslatedRecipeEdit(recipe, translated, targetLang);
  const draftIndex = drafts.findIndex((draft) => draft.id === recipeId);

  if (draftIndex >= 0) {
    drafts = drafts.map((draft, index) => (index === draftIndex ? { ...draft, ...nextEdit } : draft));
    persistDrafts();
    render();
    return;
  }

  recipeEdits[recipeId] = nextEdit;
  saveSharedStateLocally();
  render();
  await saveSharedState();
}

function queueRecipeBackfillForCurrentLanguage() {
  const targetLang = lang;
  if (!["en", "es"].includes(targetLang)) return;

  allRecipes()
    .filter((recipe) => rawRecipeNeedsLocale(rawRecipeById(recipe.id), targetLang))
    .forEach((recipe) => {
      const key = `${recipe.id}:${targetLang}`;
      if (recipeTranslationInFlight.has(key) || recipeTranslationFailed.has(key)) return;

      recipeTranslationInFlight.add(key);
      recipeTranslationQueue = recipeTranslationQueue
        .then(() => backfillRecipeLocale(recipe.id, targetLang))
        .catch((error) => {
          console.warn(error);
          recipeTranslationFailed.add(key);
        })
        .finally(() => {
          recipeTranslationInFlight.delete(key);
        });
    });
}

const recipeFormUi = createRecipeFormUi({
  $,
  t,
  escapeHtml,
  localize,
  recipeToEditableUpload,
  readFilesAsDataUrls,
  recognizeRecipe,
  importRecipeUrl,
  saveSharedRecipe,
  saveSharedState,
  getLang: () => lang,
  recipeById,
  allRecipes,
  getSelectedRecipeId: () => selectedRecipeId,
  setSelectedRecipeId: (id) => {
    selectedRecipeId = id;
  },
  setRecipeEdit: (id, edit) => {
    recipeEdits[id] = edit;
  },
  removeRecipeEdit: (id) => {
    delete recipeEdits[id];
  },
  removeDeletedRecipeId: (id) => {
    deletedRecipeIds = deletedRecipeIds.filter((deletedId) => deletedId !== id);
  },
  addDeletedRecipeId: (id) => {
    deletedRecipeIds = [...new Set([id, ...deletedRecipeIds])];
  },
  getFavorites: () => favorites,
  setFavorites: (nextFavorites) => {
    favorites = nextFavorites;
  },
  getImportedRecipePhotos: () => importedRecipePhotos,
  setImportedRecipePhotos: (photos) => {
    importedRecipePhotos = photos;
  },
  getImportedRecipeCardPhoto: () => importedRecipeCardPhoto,
  setImportedRecipeCardPhoto: (photo) => {
    importedRecipeCardPhoto = photo;
  },
  prependSharedRecipe: (recipe) => {
    sharedRecipes.unshift(recipe);
  },
  prependDraft: (draft) => {
    drafts.unshift(draft);
  },
  persistDrafts,
  updateMealsAfterRecipeDelete,
  setView,
  render,
  renderRecipes,
  setDetailStatus,
});

async function recognizeReceipt(images) {
  const data = await postJson("/.netlify/functions/recognize-receipt", { images, lang }, t("receiptScanError"));
  return Array.isArray(data.items) ? data.items : [];
}

$$("[data-lang]").forEach((button) => {
  button.addEventListener("click", () => {
    lang = supportedLang(button.dataset.lang);
    localStorage.setItem("dinner-lang", lang);
    render();
  });
});

$("#householdMemberInput").addEventListener("change", (event) => {
  householdMember = cleanHouseholdMember(event.target.value) || "Family";
  localStorage.setItem("dinner-household-member", householdMember);
});

$("#addRecipeFromLibrary").addEventListener("click", () => setView("add"));
$("#globalAddRecipe").addEventListener("click", () => setView("add"));
$("#backToRecipeLibrary").addEventListener("click", () => setView("recipes"));

$$("[data-inventory-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    inventoryMode = button.dataset.inventoryMode;
    renderInventoryMode();
  });
});

$$(".inventory-tools details").forEach((details) => {
  details.addEventListener("toggle", () => {
    if (!details.open) return;
    $$(".inventory-tools details").forEach((other) => {
      if (other !== details) other.open = false;
    });
  });
});

function renderInventoryFilterControls() {
  $$("[data-inventory-filter]").forEach((filterButton) => {
    filterButton.classList.toggle("active", filterButton.dataset.inventoryFilter === inventoryFilter);
  });
  $("#inventoryLocationFilter").value = ["fridge", "freezer", "pantry", "household"].includes(inventoryFilter)
    ? inventoryFilter
    : "";
}

$$("[data-inventory-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    inventoryFilter = button.dataset.inventoryFilter;
    renderInventoryFilterControls();
    renderInventory();
    bindInventoryControls();
  });
});

$("#inventoryLocationFilter").addEventListener("change", (event) => {
  if (!event.target.value) return;
  inventoryFilter = event.target.value;
  renderInventoryFilterControls();
  renderInventory();
  bindInventoryControls();
});

$("#inventorySearch").addEventListener("input", () => {
  renderInventory();
  bindInventoryControls();
});

$$(".tabs button").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

$$('[data-view-target]').forEach((button) => {
  button.addEventListener("click", () => {
    setView(button.dataset.viewTarget);
    if (button.dataset.inventoryTarget) {
      inventoryMode = button.dataset.inventoryTarget;
      renderInventoryMode();
    }
    if (button.dataset.viewScroll) {
      requestAnimationFrame(() => {
        $(`#${button.dataset.viewScroll}`).scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  });
});

$$("[data-scroll-to]").forEach((button) => {
  button.addEventListener("click", () => {
    $(`#${button.dataset.scrollTo}`).scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

scheduleUi.bindScheduleControls();

dashboardUi.bindDashboardControls();

$("#favoriteRecipe").addEventListener("click", async () => {
  $("#recipeMoreActions").open = false;
  if (favorites.includes(selectedRecipeId)) {
    favorites = favorites.filter((id) => id !== selectedRecipeId);
  } else {
    favorites = [selectedRecipeId, ...favorites];
  }
  render();
  await saveSharedState();
});

$("#publishDraftRecipe").addEventListener("click", async () => {
  const draft = draftById(selectedRecipeId);
  if (!draft) return;

  if (!recipeUploadHasRequiredContent(draft)) {
    setDetailStatus(t("recipePublishNeedsDetails"), true);
    return;
  }

  const button = $("#publishDraftRecipe");
  button.disabled = true;
  setDetailStatus(t("publishingDraftRecipe"));

  try {
    const saved = await saveSharedRecipe(draft);
    drafts = drafts.filter((item) => item.id !== draft.id);
    delete recipeEdits[draft.id];
    persistDrafts();
    saveSharedStateLocally();
    sharedRecipes.unshift(saved.recipe);
    selectedRecipeId = saved.recipe.id;
    render();
    $("#recipeDetail").hidden = false;
    setDetailStatus(t("draftRecipePublished"));
  } catch (error) {
    console.warn(error);
    setDetailStatus(error.message ? `${t("draftRecipePublishError")} ${error.message}` : t("draftRecipePublishError"), true);
  } finally {
    button.disabled = false;
  }
});

$("#addRecipeGroceries").addEventListener("click", async () => {
  const incoming = recipeGroceries(recipeById(selectedRecipeId));
  const merged = mergeGroceries(groceries, incoming);
  const addedCount = merged.length - groceries.length;
  const atHomeCount = incoming.filter((item) => item.inInventory).length;
  groceries = merged;
  render();
  setDetailStatus(detailGroceriesMessage(addedCount, atHomeCount));
  const saved = await saveGroceries();
  if (!saved) setDetailStatus(t("recipeGroceriesError"), true);
});

recipeFormUi.bind();
onboardingUi.bind();

$("#markCooked").addEventListener("click", () => {
  $("#markCooked").textContent = t("cookedToday");
  $("#recipeMoreActions").open = false;
});

recipeLibraryUi.bindLibraryControls();

$("#groceryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = $("#groceryInput").value.trim();
  if (!text) return;

  groceries = [
    ...manualGroceryItemsFromText(text, $("#groceryStoreInput").value),
    ...groceries,
  ];
  $("#groceryInput").value = "";
  renderGroceries();
  bindGroceryControls();
  await saveGroceries();
});

$("#generateGroceries").addEventListener("click", async () => {
  $(".grocery-tools-menu").open = false;
  groceries = mergeGroceries(groceries, generatedGroceriesFromWeek());
  renderGroceries();
  bindGroceryControls();
  await saveGroceries();
});

$("#clearCheckedGroceries").addEventListener("click", async () => {
  $(".grocery-tools-menu").open = false;
  groceries = groceries.filter((item) => !item.checked);
  renderGroceries();
  bindGroceryControls();
  await saveGroceries();
});

receiptUi.bindReceiptControls();

$("#restockPurchased").addEventListener("click", async () => {
  const purchased = purchasedGroceries();
  if (!purchased.length) return;

  purchased.forEach((grocery) => {
    const existing = inventoryMatchFor(grocery.text, true);
    if (existing) {
      existing.stockState = "full";
      existing.updatedAt = new Date().toISOString();
      existing.updatedBy = householdMember;
    } else {
      inventory.unshift(inventoryItem(grocery.text, "", "pantry", [], "full", lang, householdMember));
    }
  });
  const purchasedIds = new Set(purchased.map((item) => item.id));
  groceries = groceries.filter((item) => !purchasedIds.has(item.id));
  inventoryMode = "home";
  $("#inventoryStatus").textContent = t("movedPurchasedHome");
  renderGroceries();
  renderInventory();
  renderInventoryMode();
  bindGroceryControls();
  bindInventoryControls();
  await Promise.all([saveInventory(), saveGroceries()]);
});

$("#inventoryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = $("#inventoryInput").value.trim();
  if (!text) return;

  const photos = await readFilesAsDataUrls($("#inventoryPhotoInput").files, 1);
  inventory.unshift(inventoryItem(
    text,
    $("#inventoryQuantityInput").value.trim(),
    $("#inventoryLocationInput").value,
    photos,
    "some",
    lang,
    householdMember
  ));
  $("#inventoryInput").value = "";
  $("#inventoryQuantityInput").value = "";
  $("#inventoryPhotoInput").value = "";
  updateFileInputStatus($("#inventoryPhotoInput"));
  renderInventory();
  bindInventoryControls();
  await saveInventory();
});

$("#inventoryScanForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const files = $("#inventoryScanPhotoInput").files;
  if (!files.length) return;

  const submitButton = $("#inventoryScanForm .primary-action");
  submitButton.disabled = true;
  setSyncStatus("inventory", "inventoryScanWorking");

  try {
    const images = await readFilesAsDataUrls(files, 6);
    inventorySuggestions = await recognizeInventory(images, $("#inventoryScanLocationInput").value);
    $("#inventoryScanPhotoInput").value = "";
    updateFileInputStatus($("#inventoryScanPhotoInput"));
    renderInventorySuggestions();
    if (inventorySuggestions.length) clearAreaStatus("inventory");
    else setSyncStatus("inventory", "inventoryScanEmpty");
  } catch (error) {
    console.warn(error);
    inventorySuggestions = [];
    renderInventorySuggestions();
    setSyncStatus("inventory", "inventoryScanError", { state: "error" });
  } finally {
    submitButton.disabled = false;
  }
});

$("#retrySharedState").addEventListener("click", saveSharedState);
$("#retryGroceries").addEventListener("click", saveGroceries);
$("#retryInventory").addEventListener("click", saveInventory);

window.addEventListener("online", () => {
  const retries = [];
  if (!$("#retrySharedState").hidden) retries.push(saveSharedState());
  if (!$("#retryGroceries").hidden) retries.push(saveGroceries());
  if (!$("#retryInventory").hidden) retries.push(saveInventory());
  Promise.allSettled(retries);
});

bindInstallPrompt({ $, t });
registerServiceWorker({ $, onUpdateAvailable: showAppUpdateNotice });

setupLocalizedFileInputs();
render();
loadSharedState();
loadSharedRecipes();
loadGroceries();
loadInventory();
