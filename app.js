import {
  applyInventoryCoverage,
  cleanIngredientForGrocery,
  groceryItem,
  groceryItemsFromRecipe,
  inventoryMatchFor as findInventoryMatch,
  mergeGroceries,
  replacePlannedGroceries,
} from "./grocery-logic.js";
import { bindInstallPrompt, registerServiceWorker } from "./app-lifecycle.js";
import {
  normalizeSharedState,
  normalizeRecipeFeedback,
  persistSharedState,
  recordRecipeOutcome,
  sharedStateSnapshot as familyStateSnapshot,
} from "./family-state.js";
import { createDashboardUi } from "./dashboard-ui.js";
import { createBudgetUi } from "./budget-ui.js";
import { normalizeBudgetSettings, normalizeReceipt, normalizeReceipts } from "./budget-logic.js";
import { createActivityUi } from "./activity-ui.js?v=132";
import { createAuditUi } from "./audit-ui.js";
import { normalizeAuditEvents, normalizeStateSnapshots } from "./audit-logic.js";
import { createFamilyUi } from "./family-ui.js";
import { activityEntry, normalizeActivity } from "./activity-logic.js";
import { addAvailableFood, normalizeAvailableFood } from "./available-food.js";
import { inventoryExpirationState, inventoryItem, mergeInventory } from "./inventory-logic.js";
import { getJson, postJson, putJson } from "./api.js";
import { createGroceryUi } from "./grocery-ui.js";
import { cleanHouseholdMember } from "./household-attribution.js";
import { createHouseholdStorage, leaveHousehold, requireHouseholdSession } from "./household-access.js";
import { createInventoryUi } from "./inventory-ui.js";
import { readFilesAsDataUrls } from "./images.js";
import { localizedText, localizedTextExact, updateLocalizedText } from "./localized-data.js";
import { linesMatchLanguage, textMatchesLanguage } from "./language-quality.js";
import { createOnboardingUi } from "./onboarding-ui.js";
import { createRecipeFormUi } from "./recipe-form-ui.js";
import { createRecipeLibraryUi } from "./recipe-library-ui.js";
import { createCookAlongUi } from "./cook-along-ui.js";
import { createReceiptUi } from "./receipt-ui.js";
import { recipes } from "./recipes-data.js";
import { createScheduleUi } from "./schedule-ui.js";
import { createSharedStateLoader } from "./shared-state-loader.js";
import { readJsonStorage, readNumberStorage, readStringStorage } from "./storage-utils.js";
import { formatSyncTime, renderSyncStatus, syncRetryLabel } from "./sync-status.js";
import { translations } from "./translations.js";
import { selectRecipeMemory, selectTodayStory } from "./almanac-selectors.js";
import {
  normalizeDinnerEvents,
  normalizeDinnerEvent,
  upsertDinnerEvent,
  normalizeFamilyMembers,
  normalizeFamilyPreferences,
  normalizeFamilyRules,
  rankedRecipes,
} from "./memory-logic.js";
import {
  applyVersionConflict,
  loadVersionedCollection,
  mergeVersionedItems,
  cloneVersionedItems,
  cloneVersionedValue,
  persistVersionedCollection,
  readVersionedCollectionStorage,
  saveVersionedCollection,
} from "./versioned-collection-client.js";
import {
  categoryFor,
  categoryLabel as localizedCategoryLabel,
  compactRecipeEditsForSync,
  recipeById as findRecipeById,
  recipeToEditableUpload as recipeToEditable,
  servingsForRecipe,
  uploadToRecipe,
  visibleRecipes,
} from "./recipe-utils.js";
import {
  activeWeekDateKeys as dateKeysForWeek,
  copyCurrentWeekToNextWeek,
  currentWeekStartKey,
  days,
  emptyMeal,
  handoffOptions,
  mealPeriods,
  mealRoles,
  formatDateKey,
  mealHasContent,
  normalizeCalendar,
  normalizeMealPlan,
  normalizeSchedule,
  removeRecipeFromPlans,
  plannedServings,
  cookingServings,
  recipeBatchPlan,
} from "./schedule-utils.js";

const legacyMealSlotKeys = ["breakfast", "lunch", "lunchSalad", "dinner", "main", "side", "salad"];

function supportedLang(value) {
  return Object.prototype.hasOwnProperty.call(translations, value) ? value : "en";
}

const household = await requireHouseholdSession();
const householdStorage = createHouseholdStorage(localStorage, household.id);

let lang = supportedLang(readStringStorage(localStorage, "dinner-lang", "en"));
let householdMember = cleanHouseholdMember(readStringStorage(householdStorage, "dinner-household-member", "Family")) || "Family";
let selectedRecipeId = "meatballs";
const storedSchedule = readJsonStorage(householdStorage, "dinner-schedule", null);
let schedule = normalizeSchedule(storedSchedule || Object.fromEntries(days.map((day) => [day.key, { ...emptyMeal }])));
let calendarMeals = normalizeCalendar(readJsonStorage(householdStorage, "dinner-calendar", {}));
let weekStartKey = readStringStorage(householdStorage, "dinner-week-start", currentWeekStartKey());
let sharedStateVersion = readNumberStorage(householdStorage, "dinner-state-version", 0);
let sharedStateBaseState = null;
let scheduleVersion = readNumberStorage(householdStorage, "dinner-schedule-version", 0);
let scheduleBase = null;
let scheduleSaveInFlight = null;
let favorites = readJsonStorage(householdStorage, "dinner-favorites", []);
let tasks = readJsonStorage(householdStorage, "dinner-tasks", []);
let availableFood = normalizeAvailableFood(readJsonStorage(householdStorage, "dinner-available-food", []));
let recipeFeedback = normalizeRecipeFeedback(readJsonStorage(householdStorage, "dinner-recipe-feedback", {}));
let drafts = readJsonStorage(householdStorage, "dinner-drafts", []);
const recipeCatalogStorageKey = "dinner-shared-recipe-catalog";
const recipeCatalogCacheSchemaVersion = 3;
const recipeCatalogTtlMs = 2 * 60 * 1000;
const recipeCatalogCache = readJsonStorage(householdStorage, recipeCatalogStorageKey, null);
let sharedRecipes = recipeCatalogCache?.schemaVersion === recipeCatalogCacheSchemaVersion && Array.isArray(recipeCatalogCache.recipes)
  ? recipeCatalogCache.recipes : [];
let recipeCatalogFetchedAt = recipeCatalogCache?.schemaVersion === recipeCatalogCacheSchemaVersion
  ? Number(new Date(recipeCatalogCache.fetchedAt).getTime()) || 0 : 0;
let sharedRecipesStatus = Array.isArray(sharedRecipes) && sharedRecipes.length ? "ready" : "loading";
let recipeEdits = readJsonStorage(householdStorage, "dinner-recipe-edits", {});
let deletedRecipeIds = readJsonStorage(householdStorage, "dinner-deleted-recipes", []);
let importedRecipePhotos = [];
let importedRecipeCardPhoto = "";
const groceryStorageKeys = { itemsKey: "dinner-groceries", versionKey: "dinner-grocery-version" };
const inventoryStorageKeys = { itemsKey: "dinner-inventory", versionKey: "dinner-inventory-version" };
const storedGroceries = readVersionedCollectionStorage(householdStorage, groceryStorageKeys);
const storedInventory = readVersionedCollectionStorage(householdStorage, inventoryStorageKeys);
let groceries = storedGroceries.items;
let groceryVersion = storedGroceries.version;
let groceryBaseItems = cloneVersionedItems(storedGroceries.items);
let inventory = storedInventory.items;
let inventoryVersion = storedInventory.version;
let inventoryBaseItems = cloneVersionedItems(storedInventory.items);
let inventorySuggestions = [];
let receiptSuggestions = [];
let pendingReceipt = null;
let budgetSettings = normalizeBudgetSettings(readJsonStorage(householdStorage, "dinner-budget-settings", {}));
let receipts = normalizeReceipts(readJsonStorage(householdStorage, "dinner-receipts", []));
let activity = normalizeActivity(readJsonStorage(householdStorage, "dinner-activity", []));
let receiptsVersion = readNumberStorage(householdStorage, "dinner-receipts-version", 0);
let activityVersion = readNumberStorage(householdStorage, "dinner-activity-version", 0);
let auditHistory = { events: [], snapshots: [] };
let familyMembers = normalizeFamilyMembers(readJsonStorage(householdStorage, "dinner-family-members", []));
let familyPreferences = normalizeFamilyPreferences(readJsonStorage(householdStorage, "dinner-family-preferences", []), familyMembers);
let familyRules = normalizeFamilyRules(readJsonStorage(householdStorage, "dinner-family-rules", {}));
const dinnerHistoryStorageKeys = { itemsKey: "dinner-history", versionKey: "dinner-history-version" };
const storedDinnerHistory = readVersionedCollectionStorage(householdStorage, dinnerHistoryStorageKeys);
let dinnerEvents = normalizeDinnerEvents(storedDinnerHistory.items);
let dinnerHistoryVersion = storedDinnerHistory.version;
let dinnerHistoryPending = readStringStorage(householdStorage, "dinner-history-pending", "") === "1";
let inventoryMode = "shopping";
let inventoryFilter = "all";
let visibleMonth = new Date();
visibleMonth.setDate(1);
let recipeSearch = "";
let categoryFilter = "all";
let appUpdateNoticeShown = false;
const recipeTranslationInFlight = new Set();

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
    const button = document.createElement("button");
    button.type = "button";
    button.className = "file-picker-button";
    button.dataset.i18n = input.dataset.fileAction;
    button.textContent = t(input.dataset.fileAction);
    button.addEventListener("click", () => input.click());
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
  shared: { status: "#sharedStateStatus", retry: "#retrySharedState", panel: "#sharedSyncStatusPanel" },
  recipes: { status: "#recipeSyncStatus", retry: "#retryRecipes", panel: "#recipeSyncStatusPanel" },
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
  const panel = elements.panel ? $(elements.panel) : null;
  if (!status) return;
  if (panel) panel.hidden = false;
  if (retryButton) {
    const retryKey = syncRetryLabel(area, key);
    retryButton.dataset.i18n = retryKey;
    retryButton.textContent = t(retryKey);
  }
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
  const panel = elements.panel ? $(elements.panel) : null;
  if (panel) panel.hidden = true;
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
  if (area === "shared") {
    clearAreaStatus(area);
    return;
  }
  setSyncStatus(area, "syncedAt", { syncedAt: new Date().toISOString() });
}

let undoTimer = 0;
let sharedRetryAction = null;

function setSharedRetryAction(action) {
  sharedRetryAction = action;
}

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
    // Seed content is only an offline compatibility fallback. Once the
    // household catalog is loaded, it is normalized into the same catalog as
    // every recipe the family has added.
    seedRecipes: sharedRecipesStatus === "ready" ? [] : recipes,
    sharedRecipes,
    drafts,
    recipeEdits,
    deletedRecipeIds,
    localize,
  });
}

function seedRecipeCatalogRecord(recipe) {
  return {
    ...recipe,
    ingredientsText: {
      en: (recipe.ingredients?.en || []).join("\n"),
      es: (recipe.ingredients?.es || []).join("\n"),
    },
    stepsText: {
      en: (recipe.steps?.en || []).join("\n"),
      es: (recipe.steps?.es || []).join("\n"),
    },
  };
}

function persistRecipeCatalog(items) {
  try {
    const cacheable = items.map((recipe) => ({
      ...recipe,
      photos: (recipe.photos || []).filter((photo) => !`${photo}`.startsWith("data:image/")),
      cardPhoto: `${recipe.cardPhoto || ""}`.startsWith("data:image/") ? "" : recipe.cardPhoto || "",
    }));
    recipeCatalogFetchedAt = Date.now();
    householdStorage.setItem(recipeCatalogStorageKey, JSON.stringify({
      schemaVersion: recipeCatalogCacheSchemaVersion,
      recipes: cacheable,
      fetchedAt: new Date(recipeCatalogFetchedAt).toISOString(),
    }));
  } catch {
    console.warn("Recipe catalog could not be cached on this device.");
  }
}

function recipeById(id) {
  return findRecipeById(allRecipes(), id, recipes);
}

function draftById(id) {
  return drafts.find((draft) => draft.id === id) || null;
}

function persistDrafts() {
  householdStorage.setItem("dinner-drafts", JSON.stringify(drafts));
}

function persistGroceriesLocally(items = groceries, version = groceryVersion) {
  persistVersionedCollection(householdStorage, groceryStorageKeys, items, version);
}

function persistInventoryLocally(items = inventory, version = inventoryVersion) {
  persistVersionedCollection(householdStorage, inventoryStorageKeys, items, version);
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
  const updated = removeRecipeFromPlans(schedule, calendarMeals, recipeId, legacyMealSlotKeys);
  schedule = updated.schedule;
  calendarMeals = updated.calendarMeals;
}

function localize(value) {
  return localizedText(value, lang);
}

function localizeExact(value) {
  const text = localizedTextExact(value, lang);
  if (text && textMatchesLanguage(text, lang)) return text;
  return localizedText(value, lang);
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
}

async function goToCurrentWeek() {
  if (weekStartKey === currentWeekStartKey()) return;
  persistActiveWeekToCalendar();
  weekStartKey = currentWeekStartKey();
  schedule = scheduleForWeek(weekStartKey);
  visibleMonth = new Date(`${weekStartKey}T12:00:00`);
  visibleMonth.setDate(1);
  render();
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

function plannedMealsByDate() {
  const meals = new Map(Object.entries(calendarMeals).map(([dateKey, meal]) => [dateKey, normalizeMealPlan(meal)]));
  activeWeekDateKeys().forEach(({ key, dateKey }) => {
    if (!meals.has(dateKey)) meals.set(dateKey, normalizeMealPlan(schedule[key]));
  });
  return meals;
}

function availableLeftoversForDate(targetDateKey, targetPeriod = "") {
  const meals = plannedMealsByDate();
  const allocated = new Map();
  meals.forEach((meal) => meal.items.filter((item) => item.sourceType === "leftover").forEach((item) => {
    const sourceKey = `${item.leftoverSourceDate}::${item.leftoverSourceItemId}`;
    allocated.set(sourceKey, (allocated.get(sourceKey) || 0) + (Number(item.servings) || 0));
  }));

  return [...meals.entries()]
    .filter(([dateKey]) => dateKey < targetDateKey || (dateKey === targetDateKey && targetPeriod))
    .flatMap(([sourceDate, meal]) => meal.items
      .filter((item) => item.sourceType !== "leftover" && (!targetPeriod || item.period !== targetPeriod))
      .map((item) => {
        const recipe = recipeById(item.recipeId);
        const plan = meal.servingPlans?.[item.period] || meal.servingPlan;
        const plannedYield = recipe
          ? recipeBatchPlan(servingsForRecipe(recipe), cookingServings(plan), plannedServings(plan))?.expectedLeftovers || 0
          : 0;
        const produced = Number(meal.servingPlan.actualLeftovers?.[item.id]
          ?? meal.servingPlan.actualLeftovers?.[item.recipeId]
          ?? plannedYield);
        const availableServings = Math.max(0, produced - (allocated.get(`${sourceDate}::${item.id}`) || 0));
        return {
          sourceDate,
          itemId: item.id,
          recipe,
          availableServings,
        };
      }))
    .filter((entry) => entry.recipe && entry.availableServings >= 0.5)
    .sort((left, right) => right.sourceDate.localeCompare(left.sourceDate));
}

function sharedStateSnapshot() {
  return familyStateSnapshot({
    weekStartKey,
    schedule,
    calendarMeals,
    favorites,
    tasks,
    availableFood,
    recipeFeedback,
    budgetSettings,
    familyMembers,
    familyPreferences,
    familyRules,
    recipeEdits: compactRecipeEditsForSync(recipeEdits, sharedRecipes),
    deletedRecipeIds,
  });
}

function currentSharedState() {
  return { weekStartKey, schedule, calendarMeals, favorites, tasks, availableFood, recipeFeedback, budgetSettings, receipts, activity, familyMembers, familyPreferences, familyRules, recipeEdits, deletedRecipeIds };
}

function persistLedger(kind, items, version) {
  householdStorage.setItem(`dinner-${kind}`, JSON.stringify(items));
  householdStorage.setItem(`dinner-${kind}-version`, `${Number(version) || 0}`);
}

async function loadLedger(kind) {
  try {
    const data = await getJson(`/.netlify/functions/family-ledger?kind=${kind}`, "Could not load household history.");
    const items = kind === "receipts" ? normalizeReceipts(data.items) : normalizeActivity(data.items);
    const version = Number(data.version) || 0;
    const legacyItems = kind === "receipts" ? receipts : activity;
    if (kind === "receipts") { receipts = items.length ? items : legacyItems; receiptsVersion = version; }
    else { activity = items.length ? items : legacyItems; activityVersion = version; }
    persistLedger(kind, items, version);
    if (!items.length && legacyItems.length) await saveLedger(kind);
    render();
  } catch (error) { console.warn(error); }
}

async function saveLedger(kind, retrying = false) {
  const items = kind === "receipts" ? receipts : activity;
  const version = kind === "receipts" ? receiptsVersion : activityVersion;
  try {
    const data = await putJson(`/.netlify/functions/family-ledger?kind=${kind}`, { items, version }, "Could not save household history.");
    if (kind === "receipts") receiptsVersion = Number(data.version) || version;
    else activityVersion = Number(data.version) || version;
    persistLedger(kind, items, kind === "receipts" ? receiptsVersion : activityVersion);
    return true;
  } catch (error) {
    if (error.status === 409 && Array.isArray(error.data?.items) && !retrying) {
      if (kind === "receipts") { receipts = normalizeReceipts([...receipts, ...error.data.items]); receiptsVersion = Number(error.data.version) || version; }
      else { activity = normalizeActivity([...activity, ...error.data.items]); activityVersion = Number(error.data.version) || version; }
      return saveLedger(kind, true);
    }
    console.warn(error);
    return false;
  }
}

function recordActivity(type, label) {
  const entry = activityEntry(type, label, householdMember);
  if (entry) activity = [entry, ...activity].slice(0, 200);
}

function applySharedState(nextState) {
  schedule = nextState.schedule;
  calendarMeals = nextState.calendarMeals;
  weekStartKey = nextState.weekStartKey || weekStartKey;
  favorites = nextState.favorites;
  tasks = nextState.tasks;
  availableFood = normalizeAvailableFood(nextState.availableFood);
  recipeFeedback = normalizeRecipeFeedback(nextState.recipeFeedback);
  budgetSettings = normalizeBudgetSettings(nextState.budgetSettings);
  receipts = normalizeReceipts(nextState.receipts);
  activity = normalizeActivity(nextState.activity);
  familyMembers = normalizeFamilyMembers(nextState.familyMembers);
  familyPreferences = normalizeFamilyPreferences(nextState.familyPreferences, familyMembers);
  familyRules = normalizeFamilyRules(nextState.familyRules);
  recipeEdits = nextState.recipeEdits;
  deletedRecipeIds = nextState.deletedRecipeIds;
}

function saveSharedStateLocally() {
  const localState = {
    ...currentSharedState(),
    recipeEdits: compactRecipeEditsForSync(recipeEdits, sharedRecipes),
  };
  if (!persistSharedState(householdStorage, localState, sharedStateVersion)) {
    console.warn("Shared menu local cache is full; continuing with the live household copy.");
  }
}

function persistScheduleLocally() {
  try {
    householdStorage.setItem("dinner-schedule", JSON.stringify(schedule));
    householdStorage.setItem("dinner-calendar", JSON.stringify(calendarMeals));
    householdStorage.setItem("dinner-week-start", weekStartKey);
    householdStorage.setItem("dinner-schedule-version", `${scheduleVersion}`);
  } catch {
    console.warn("Meal plan could not be cached on this device.");
  }
}

function mergeSchedule(server, local, base) {
  const mergeMap = (serverMap = {}, localMap = {}, baseMap = {}) => {
    const keys = new Set([...Object.keys(serverMap), ...Object.keys(localMap), ...Object.keys(baseMap)]);
    return Object.fromEntries([...keys].map((key) => [
      key,
      JSON.stringify(localMap[key]) !== JSON.stringify(baseMap[key]) ? localMap[key] : serverMap[key],
    ]).filter(([, value]) => value !== undefined));
  };
  return {
    schedule: mergeMap(server.schedule, local.schedule, base?.schedule),
    calendarMeals: mergeMap(server.calendarMeals, local.calendarMeals, base?.calendarMeals),
    weekStartKey: local.weekStartKey !== base?.weekStartKey ? local.weekStartKey : server.weekStartKey,
  };
}

function applyScheduleRecord(data) {
  const next = data?.schedule && data.schedule.schedule ? data.schedule : data;
  schedule = normalizeSchedule(next?.schedule || schedule);
  calendarMeals = normalizeCalendar(next?.calendarMeals || calendarMeals);
  if (next?.weekStartKey) weekStartKey = next.weekStartKey;
  scheduleVersion = Number(data?.version) || 0;
  scheduleBase = cloneVersionedValue({ schedule, calendarMeals, weekStartKey });
  persistScheduleLocally();
}

async function saveSchedule({ retrying = false, allowEmptySchedule = false } = {}) {
  setSharedRetryAction(() => saveSchedule({ retrying: false }));
  if (scheduleSaveInFlight && !retrying) return scheduleSaveInFlight;
  const local = { schedule, calendarMeals, weekStartKey };
  persistScheduleLocally();
  const run = (async () => {
    try {
      const data = await putJson("/.netlify/functions/schedule", {
        ...local,
        version: scheduleVersion,
        actor: householdMember,
        allowEmptySchedule,
      }, "Could not save the meal plan.");
      applyScheduleRecord(data);
      clearAreaStatus("shared");
      await saveLedger("activity");
      return true;
    } catch (error) {
      if (error.status === 409 && !retrying) {
        const server = {
          schedule: normalizeSchedule(error.data?.schedule),
          calendarMeals: normalizeCalendar(error.data?.calendarMeals),
          weekStartKey: error.data?.weekStartKey || weekStartKey,
        };
        const merged = mergeSchedule(server, local, scheduleBase || server);
        schedule = normalizeSchedule(merged.schedule);
        calendarMeals = normalizeCalendar(merged.calendarMeals);
        weekStartKey = merged.weekStartKey || weekStartKey;
        scheduleVersion = Number(error.data?.version) || scheduleVersion;
        scheduleBase = cloneVersionedValue(server);
        persistScheduleLocally();
        render();
        return saveSchedule({ retrying: true, allowEmptySchedule });
      }
      setSyncStatus("shared", "savedLocallyPending", { state: "pending", canRetry: true });
      return false;
    }
  })();
  scheduleSaveInFlight = run;
  try { return await run; } finally { scheduleSaveInFlight = null; }
}

async function loadSchedule() {
  setSharedRetryAction(() => loadSchedule());
  try {
    const data = await getJson("/.netlify/functions/schedule", "Could not load the meal plan.");
    applyScheduleRecord(data);
    render();
    return true;
  } catch (error) {
    console.warn(error);
    setSyncStatus("shared", "sharedMenuUnavailable", { state: "error", canRetry: true });
    return false;
  }
}

function mergeSharedState(serverState, localState, baseState) {
  const merged = { ...serverState };
  Object.keys(localState).forEach((key) => {
    if (key === "schedule" || key === "calendarMeals") {
      const localMap = localState[key] || {};
      const baseMap = baseState?.[key] || {};
      const serverMap = serverState[key] || {};
      const keys = new Set([...Object.keys(baseMap), ...Object.keys(localMap), ...Object.keys(serverMap)]);
      merged[key] = Object.fromEntries([...keys].map((entry) => [
        entry,
        JSON.stringify(localMap[entry]) !== JSON.stringify(baseMap[entry])
          ? localMap[entry]
          : serverMap[entry],
      ]).filter(([, value]) => value !== undefined));
    } else if (JSON.stringify(localState[key]) !== JSON.stringify(baseState?.[key])) {
      merged[key] = localState[key];
    }
  });
  return merged;
}

let sharedSaveInFlight = null;
let sharedSaveQueued = false;
let sharedSaveQueuedOptions = null;

async function performSaveSharedState({ retrying = false, allowEmptySchedule = false, auditAction = "" } = {}) {
  setSharedRetryAction(saveSharedState);
  saveSharedStateLocally();
  setSyncStatus("shared", "savedLocallySyncing", { state: "pending" });

  try {
    const data = await putJson(
      "/.netlify/functions/family-state",
      {
        state: sharedStateSnapshot(),
        version: sharedStateVersion,
        actor: householdMember,
        auditAction,
        allowEmptySchedule,
      },
      "Could not save shared family state."
    );
    sharedStateVersion = Number(data.version) || sharedStateVersion;
    if (data.state) {
      applySharedState(normalizeSharedState(data.state, currentSharedState()));
      sharedStateBaseState = cloneVersionedValue(sharedStateSnapshot());
      saveSharedStateLocally();
    }
    markSynced("shared");
    return true;
  } catch (error) {
    console.warn(error);
    if (error.status === 413) {
      setSyncStatus("shared", "sharedMenuTooLarge", { state: "error" });
      return false;
    }
    if (error.status === 409 && error.data?.code === "empty-overwrite-blocked" && error.data?.state) {
      sharedStateVersion = Number(error.data.version) || sharedStateVersion;
      applySharedState(normalizeSharedState(error.data.state, currentSharedState()));
      sharedStateBaseState = cloneVersionedValue(sharedStateSnapshot());
      saveSharedStateLocally();
      render();
      setSyncStatus("shared", "emptyOverwriteBlocked", { state: "error" });
      return false;
    }
    if (error.status === 409 && error.data?.state) {
      const serverState = normalizeSharedState(error.data.state, currentSharedState());
      const localState = sharedStateSnapshot();
      const mergedState = mergeSharedState(serverState, localState, sharedStateBaseState || serverState);
      sharedStateVersion = Number(error.data.version) || sharedStateVersion;
      applySharedState(normalizeSharedState(mergedState, currentSharedState()));
      sharedStateBaseState = cloneVersionedValue(serverState);
      saveSharedStateLocally();
      render();
      if (!retrying) return performSaveSharedState({ retrying: true, allowEmptySchedule, auditAction });
      // A second conflict can be caused by this same phone refreshing while a
      // save is in flight. Keep the change recoverable without presenting it
      // as proof that another person edited the menu.
      setSyncStatus("shared", "savedLocallyPending", { state: "pending", canRetry: true });
      return false;
    }
    setSyncStatus("shared", "savedLocallyPending", { state: "pending", canRetry: true });
    return false;
  }
}

async function saveSharedState(options = {}) {
  if (sharedSaveInFlight && !options.retrying) {
    sharedSaveQueued = true;
    sharedSaveQueuedOptions = { ...options };
    await sharedSaveInFlight;
    return true;
  }
  if (options.retrying) return performSaveSharedState(options);

  sharedSaveInFlight = performSaveSharedState(options);
  try {
    const result = await sharedSaveInFlight;
    if (result) {
      await Promise.all([saveLedger("activity"), saveLedger("receipts")]);
    }
    return result;
  } finally {
    sharedSaveInFlight = null;
    if (sharedSaveQueued) {
      sharedSaveQueued = false;
      const queuedOptions = sharedSaveQueuedOptions || {};
      sharedSaveQueuedOptions = null;
      await saveSharedState(queuedOptions);
    }
  }
}

async function applyLoadedSharedState(data) {
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
    availableFood,
    recipeFeedback,
    budgetSettings,
    receipts,
    activity,
    familyMembers,
    familyPreferences,
    familyRules,
    recipeEdits: {},
    deletedRecipeIds: [],
  }));
  sharedStateBaseState = cloneVersionedValue(sharedStateSnapshot());
  const rolledForward = rollWeekForwardIfNeeded();
  const compactEdits = compactRecipeEditsForSync(recipeEdits, sharedRecipes);
  const compactedDuplicateMedia = JSON.stringify(compactEdits) !== JSON.stringify(recipeEdits);
  if (compactedDuplicateMedia) recipeEdits = compactEdits;
  saveSharedStateLocally();
  render();
  if (rolledForward || missingWeekStart || compactedDuplicateMedia) {
    await saveSharedState();
  } else {
    markSynced("shared");
  }
}

const sharedStateLoader = createSharedStateLoader({
  fetchState: () => getJson("/.netlify/functions/family-state", "Could not load shared family state."),
  applyState: applyLoadedSharedState,
  onUnavailable: (error) => {
    console.warn(error);
    setSyncStatus("shared", "sharedMenuUnavailable", { state: "error", canRetry: true });
  },
  onApplyError: (error) => {
    console.error(error);
    setSyncStatus("shared", "sharedMenuUpdateError", { state: "error", canRetry: true });
  },
});

function loadSharedState({ restart = false } = {}) {
  setSharedRetryAction(() => loadSharedState({ restart: true }));
  clearAreaStatus("shared");
  return sharedStateLoader.load({ restart });
}

let lastForegroundSyncAt = 0;
async function refreshSharedDataOnReturn() {
  if (document.hidden) return;
  const now = Date.now();
  if (now - lastForegroundSyncAt < 12000) return;
  lastForegroundSyncAt = now;
  await Promise.allSettled([loadSharedState({ restart: true }), loadGroceries()]);
}

document.addEventListener("visibilitychange", refreshSharedDataOnReturn);
window.addEventListener("focus", refreshSharedDataOnReturn);

function persistDinnerHistoryLocally(items = dinnerEvents, version = dinnerHistoryVersion) {
  try {
    persistVersionedCollection(householdStorage, dinnerHistoryStorageKeys, normalizeDinnerEvents(items), version);
  } catch {
    console.warn("Dinner history could not be cached on this device.");
  }
}

async function loadDinnerHistory() {
  try {
    const localEvents = dinnerEvents;
    const data = await getJson("/.netlify/functions/dinner-history", "Could not load dinner history.");
    dinnerHistoryVersion = Number(data.version) || 0;
    dinnerEvents = normalizeDinnerEvents(dinnerHistoryPending ? [...localEvents, ...(data.items || [])] : data.items);
    persistDinnerHistoryLocally();
    render();
    if (dinnerHistoryPending) return saveDinnerHistory();
    return true;
  } catch (error) {
    console.warn(error);
    return false;
  }
}

async function saveDinnerHistory() {
  const localEvents = normalizeDinnerEvents(dinnerEvents);
  dinnerEvents = localEvents;
  persistDinnerHistoryLocally();
  try {
    const result = await saveVersionedCollection({
      putJson,
      url: "/.netlify/functions/dinner-history",
      fallbackMessage: "Could not save dinner history.",
      items: dinnerEvents,
      version: dinnerHistoryVersion,
      setItems: (items) => { dinnerEvents = normalizeDinnerEvents(items); },
      setVersion: (version) => { dinnerHistoryVersion = version; },
      persist: persistDinnerHistoryLocally,
    });
    dinnerHistoryPending = false;
    householdStorage.removeItem("dinner-history-pending");
    return result.saved;
  } catch (error) {
    if (error.status === 409 && Array.isArray(error.data?.items)) {
      dinnerHistoryVersion = Number(error.data.version) || dinnerHistoryVersion;
      dinnerEvents = normalizeDinnerEvents([...localEvents, ...error.data.items]);
      persistDinnerHistoryLocally();
      try {
        const data = await putJson(
          "/.netlify/functions/dinner-history",
          { items: dinnerEvents, version: dinnerHistoryVersion },
          "Could not merge dinner history."
        );
        dinnerEvents = normalizeDinnerEvents(data.items || dinnerEvents);
        dinnerHistoryVersion = Number(data.version) || dinnerHistoryVersion;
        persistDinnerHistoryLocally();
        dinnerHistoryPending = false;
        householdStorage.removeItem("dinner-history-pending");
        return true;
      } catch (retryError) {
        console.warn(retryError);
        dinnerHistoryPending = true;
        householdStorage.setItem("dinner-history-pending", "1");
        return false;
      }
    }
    console.warn(error);
    dinnerHistoryPending = true;
    householdStorage.setItem("dinner-history-pending", "1");
    return false;
  }
}

function todaysRecipeId() {
  const meal = todaysMealPlan();
  return mealRecipes(meal).find(({ period, role }) => period === "dinner" && role === "main")?.recipe.id
    || mealRecipes(meal)[0]?.recipe.id
    || "meatballs";
}

function mealRecipes(meal) {
  return (normalizeMealPlan(meal).items || [])
    .map((item) => ({
      key: item.period,
      period: item.period,
      role: item.role,
      sourceType: item.sourceType,
      leftoverSourceDate: item.leftoverSourceDate,
      leftoverSourceItemId: item.leftoverSourceItemId,
      servings: item.servings,
      itemId: item.id,
      recipe: item.recipeId ? recipeById(item.recipeId) : null,
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
  return mealPeriods.map((period) => {
    const names = items.filter((item) => item.period === period.key)
      .map(({ recipe }) => localizeExact(recipe.name) || t("translationPendingShort"));
    return names.length ? `${t(period.label)}: ${names.join(", ")}` : "";
  }).filter(Boolean).join(" · ");
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

function recipeGroceries(recipe, source = "recipe-detail", mealUse = null, scale = 1) {
  const use = mealUse ? {
    ...mealUse,
    recipeId: recipe.id,
    recipeName: recipe.name,
  } : null;
  return groceryItemsFromRecipe(recipe, lang, inventory, householdMember, use, scale).map((item) => ({
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

function dateKeysForGroceryRange(range) {
  if (range === "next3") {
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    return Array.from({ length: 3 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return formatDateKey(date);
    });
  }
  if (range === "nextWeek") {
    const start = new Date(`${currentWeekStartKey()}T12:00:00`);
    start.setDate(start.getDate() + 7);
    return dateKeysForWeek(formatDateKey(start)).map(({ dateKey }) => dateKey);
  }
  if (range === "month") {
    const start = new Date(visibleMonth);
    start.setDate(1);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return Array.from({ length: Math.round((end - start) / 86400000) }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return formatDateKey(date);
    });
  }
  if (range === "next14") {
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return formatDateKey(date);
    });
  }
  return activeWeekDateKeys().map(({ dateKey }) => dateKey);
}

function generatedGroceriesFromPlan(range = "week") {
  return dateKeysForGroceryRange(range).flatMap((dateKey) => {
    const meal = calendarMealForDateKey(dateKey);
    return mealRecipes(meal)
      .filter(({ sourceType }) => sourceType !== "leftover")
      .flatMap(({ recipe, period }) => {
        const neededServings = plannedServings(meal.servingPlans?.[period] || meal.servingPlan);
        const batch = recipeBatchPlan(servingsForRecipe(recipe), cookingServings(meal.servingPlans?.[period] || meal.servingPlan), neededServings);
        const batches = batch?.batches || 1;
        return recipeGroceries(recipe, "meal-plan", {
          dateKey,
          mealSlot: period,
          batches,
          servings: neededServings,
        }, batches);
      });
  });
}

function generatedGroceriesForMeal(dateKey, mealSlot) {
  const meal = calendarMealForDateKey(dateKey);
  return mealRecipes(meal)
    .filter(({ sourceType, period }) => sourceType !== "leftover" && period === mealSlot)
    .flatMap(({ recipe, period }) => {
      const neededServings = plannedServings(meal.servingPlans?.[period] || meal.servingPlan);
      const batch = recipeBatchPlan(servingsForRecipe(recipe), cookingServings(meal.servingPlans?.[period] || meal.servingPlan), neededServings);
      const batches = batch?.batches || 1;
      return recipeGroceries(recipe, "meal-plan", {
        dateKey,
        mealSlot: period,
        batches,
        servings: neededServings,
      }, batches);
    });
}

function manualGroceryItemsFromText(text, store) {
  const source = `${text || ""}`;
  const parts = source.includes("\n") || source.includes(";")
    ? source.split(/\n|;/)
    : source.split(/,(?!\s*\d+(?:%|\s*%))/);
  return parts
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

function movePurchasedItemsHome() {
  const purchased = purchasedGroceries();
  purchased.forEach((grocery) => {
    const existing = inventoryMatchFor(grocery.text, true);
    if (existing) {
      const nextExisting = { ...existing, stockState: "full", updatedAt: new Date().toISOString(), updatedBy: householdMember };
      inventory = inventory.map((item) => item.id === existing.id ? nextExisting : item);
    } else {
      inventory.unshift(inventoryItem(grocery.text, "", "pantry", [], "full", lang, householdMember));
    }
  });
  const purchasedIds = new Set(purchased.map((item) => item.id));
  groceries = groceries.filter((item) => !purchasedIds.has(item.id));
  return purchased.length;
}

function closeFinishShoppingPanel() {
  $("#finishShoppingPanel").hidden = true;
  $("#receiptScanPanel").hidden = true;
  $("#scanReceiptToggle").setAttribute("aria-expanded", "false");
  document.body.classList.remove("finish-shopping-open");
}

function showHomeAfterTrip() {
  inventoryMode = "home";
  closeFinishShoppingPanel();
  $("#inventoryStatus").textContent = t("movedPurchasedHome");
  renderInventoryMode();
}

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

async function addHouseholdReceipt(receipt) {
  receipts = [normalizeReceipt({ ...receipt, updatedBy: householdMember }), ...receipts];
  recordActivity("receipt", t("activityReceiptAdded").replace("{store}", receipt.store || t("receiptStore")));
  await saveSharedState();
}

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
  getPendingReceipt: () => pendingReceipt,
  setPendingReceipt: (receipt) => {
    pendingReceipt = receipt;
  },
  addReceipt: addHouseholdReceipt,
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
  finishPurchasedItems: movePurchasedItemsHome,
  onTripFinished: showHomeAfterTrip,
});

const renderReceiptSuggestions = () => receiptUi.renderReceiptSuggestions();

const budgetUi = createBudgetUi({
  $,
  $$,
  t,
  escapeHtml,
  getBudgetSettings: () => budgetSettings,
  setBudgetSettings: (settings) => {
    budgetSettings = normalizeBudgetSettings(settings);
    recordActivity("budget", t("activityBudgetUpdated"));
  },
  getReceipts: () => receipts,
  setReceipts: (items) => {
    receipts = normalizeReceipts(items);
  },
  saveSharedState,
});

const renderBudget = () => budgetUi.renderBudget();
const activityUi = createActivityUi({ $, t, escapeHtml, getActivity: () => activity });
const renderActivity = () => activityUi.renderActivity();
const auditUi = createAuditUi({
  $, t, escapeHtml,
  getHistory: () => auditHistory,
  onRestore: restoreAuditSnapshot,
});
const renderAuditHistory = () => auditUi.render();

async function loadAuditHistory() {
  try {
    const data = await getJson("/.netlify/functions/family-audit", "Could not load household change history.");
    auditHistory = {
      events: normalizeAuditEvents(data.events),
      snapshots: normalizeStateSnapshots(data.snapshots),
    };
    renderAuditHistory();
    return true;
  } catch (error) {
    console.warn(error);
    return false;
  }
}

async function restoreAuditSnapshot(snapshotId) {
  const snapshot = auditHistory.snapshots.find((item) => item.id === snapshotId);
  if (!snapshot) return;
  if (!window.confirm(t("restoreMenuConfirm"))) return;
  const restored = normalizeSharedState({
    weekStart: snapshot.weekStart,
    schedule: snapshot.schedule,
    calendarMeals: snapshot.calendarMeals,
  }, currentSharedState());
  applySharedState(restored);
  render();
  await saveSharedState({ allowEmptySchedule: true, auditAction: "restore-menu" });
  setSyncStatus("shared", "menuRestored", { state: "success" });
}

function renderSmartSuggestions() {
  const suggestions = [];
  const urgentInventory = inventory.find((item) => ["expired", "soon"].includes(inventoryExpirationState(item)));
  if (urgentInventory) suggestions.push({
    title: t("suggestionUseSoon").replace("{item}", localizeExact(urgentInventory.text)),
    copy: t("suggestionUseSoonCopy"),
    view: "grocery",
    inventory: "home",
  });
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = formatDateKey(tomorrow);
  const leftovers = availableLeftoversForDate(tomorrowKey);
  if (leftovers.length) suggestions.push({
    title: t("suggestionLeftovers").replace("{recipe}", localizeExact(leftovers[0].recipe.name)),
    copy: t("suggestionLeftoversCopy").replace("{count}", leftovers[0].availableServings),
    view: "schedule",
  });
  if (!mealHasContent(calendarMealForDateKey(tomorrowKey))) {
    const hasMemory = dinnerEvents.length || familyPreferences.length;
    const recommendation = hasMemory ? rankedRecipes(allRecipes(), {
      events: dinnerEvents,
      members: familyMembers,
      preferences: familyPreferences,
      rules: familyRules,
      recipeFeedback,
      dateKey: tomorrowKey,
    })[0] : null;
    if (recommendation) {
      const reason = recommendation.recommendation.reasons.includes("liked")
        ? t("suggestionReasonLiked")
        : recommendation.recommendation.reasons.includes("reliable")
          ? t("suggestionReasonReliable")
          : recommendation.recommendation.reasons.includes("notRecent")
            ? t("suggestionReasonNotRecent")
            : t("suggestionReasonFits");
      suggestions.push({
        title: t("suggestionRememberedRecipe").replace("{recipe}", localize(recommendation.recipe.name)),
        copy: reason,
        view: "schedule",
      });
    } else suggestions.push({
      title: t("suggestionPlanTomorrow"),
      copy: t("suggestionPlanTomorrowCopy"),
      view: "schedule",
    });
  }
  const panel = $("#smartSuggestions");
  panel.hidden = !suggestions.length;
  $("#smartSuggestionList").innerHTML = suggestions.slice(0, 3).map((suggestion) => `<button type="button" data-suggestion-view="${suggestion.view}" ${suggestion.inventory ? `data-suggestion-inventory="${suggestion.inventory}"` : ""}><strong>${escapeHtml(suggestion.title)}</strong><span>${escapeHtml(suggestion.copy)}</span></button>`).join("");
  $$('[data-suggestion-view]').forEach((button) => button.addEventListener("click", () => {
    setView(button.dataset.suggestionView);
    if (button.dataset.suggestionInventory) {
      inventoryMode = button.dataset.suggestionInventory;
      renderInventoryMode();
    }
  }));
}

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
  if ($("#taskAssigneeInput") && !$("#taskAssigneeInput").value.trim()) {
    $("#taskAssigneeInput").value = householdMember;
  }
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
  servingsForRecipe,
  plannedServings,
  recipeBatchPlan,
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
  getAvailableFood: () => availableFood,
  setAvailableFood: (nextAvailableFood) => {
    availableFood = normalizeAvailableFood(nextAvailableFood);
  },
  addAvailableFood,
  getCalendarMeals: () => calendarMeals,
  setCalendarMeals: (nextCalendarMeals) => {
    calendarMeals = normalizeCalendar(nextCalendarMeals);
  },
  handoffOptions,
  getSelectedRecipeId: () => selectedRecipeId,
  setSelectedRecipeId: (id) => {
    selectedRecipeId = id;
  },
  openFocusedDinnerPlan: (dateKey) => {
    setView("schedule");
    scheduleUi.openFocusedDinner(dateKey);
  },
  selectTodayStory: (input) => selectTodayStory(input),
  getRecipeMemory: (recipeId) => selectRecipeMemory(recipeId, dinnerEvents, familyMembers),
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
  mealPeriods,
  mealRoles,
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
  servingsForRecipe,
  plannedServings,
  cookingServings,
  recipeBatchPlan,
  allRecipes,
  availableLeftoversForDate,
  openGroceriesForMeal: async (dateKey, mealSlot) => {
    const plannedRecipeIds = new Set(mealRecipes(calendarMealForDateKey(dateKey))
      .filter(({ sourceType, period }) => sourceType !== "leftover" && period === mealSlot)
      .map(({ recipe }) => recipe.id));
    const listedRecipeIds = new Set(groceries.flatMap((item) => (item.mealUses || [])
      .filter((use) => use.dateKey === dateKey && use.mealSlot === mealSlot)
      .map((use) => use.recipeId)));
    const needsIngredients = [...plannedRecipeIds].some((recipeId) => !listedRecipeIds.has(recipeId));
    if (needsIngredients) {
      const incoming = applyInventoryCoverage(generatedGroceriesForMeal(dateKey, mealSlot), inventory);
      groceries = mergeGroceries(groceries, incoming);
      recordActivity("grocery", t("activityMealGroceriesAdded"));
      await Promise.all([saveGroceries(), saveSharedState()]);
    }
    inventoryMode = "shopping";
    renderInventoryMode();
    groceryUi.showMeal(dateKey, mealSlot);
    setView("grocery");
    requestAnimationFrame(() => {
      $("#groceryList")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  },
  recordActivity,
  copyCurrentWeekToNextWeek: () => {
    const result = copyCurrentWeekToNextWeek(weekStartKey, schedule, calendarMeals);
    calendarMeals = normalizeCalendar(result.calendarMeals);
    return result;
  },
  saveSharedState,
  saveSchedule,
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
  getFamilyMembers: () => familyMembers,
  onFocusedDinnerComplete: () => {
    setView("today");
    renderToday();
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
  getPlannedRecipeIds: () => [...new Set(Object.values(schedule)
    .flatMap((meal) => normalizeMealPlan(meal).items.map((item) => item.recipeId)))],
  allRecipes,
  getRecipeCatalogStatus: () => sharedRecipesStatus,
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
  getRecipeMemory: (recipeId) => selectRecipeMemory(recipeId, dinnerEvents, familyMembers),
  onRecipeOpen: loadRecipeDetail,
  canTranslateRecipe: (recipeId, targetLang) => {
    const recipe = rawRecipeById(recipeId);
    return Boolean(
      rawRecipeNeedsLocale(recipe, targetLang)
      && recipeTranslationSourceLang(recipe, targetLang)
    );
  },
  isRecipeTranslationPending: (recipeId, targetLang) => recipeTranslationInFlight.has(`${recipeId}:${targetLang}`),
  setView,
});

const renderRecipes = () => recipeLibraryUi.renderRecipes();
const renderDetail = () => recipeLibraryUi.renderDetail();
const bindOpenButtons = () => recipeLibraryUi.bindOpenButtons();

const cookAlongUi = createCookAlongUi({
  $,
  t,
  localize,
  escapeHtml,
  getLang: () => lang,
  saveSession: async ({ recipe, servings, leftovers, note, outcome }) => {
    const dateKey = formatDateKey(new Date());
    const existing = dinnerEvents.find((event) => event.dateKey === dateKey);
    const event = normalizeDinnerEvent({
      ...(existing || {}),
      id: `dinner-${dateKey}`,
      dateKey,
      status: "cooked",
      outcome: outcome === "made" ? "worked" : outcome,
      items: [...(existing?.items || []).filter((item) => item.recipeId !== recipe.id), {
        id: `cook-${recipe.id}`,
        recipeId: recipe.id,
        name: localize(recipe.name),
        role: categoryFor(recipe),
      }],
      leftovers: { ...(existing?.leftovers || {}), [recipe.id]: Number(leftovers) || 0 },
      note: [servings ? `Actual servings: ${servings}.` : "", note].filter(Boolean).join(" "),
      updatedAt: new Date().toISOString(),
      updatedBy: householdMember,
    });
    dinnerEvents = upsertDinnerEvent(dinnerEvents, event);
    const feedbackOutcome = ({ loved: "loved", made: "made", mixed: "made", skip: "skip" })[outcome];
    if (feedbackOutcome) recipeFeedback = recordRecipeOutcome(recipeFeedback, recipe.id, feedbackOutcome, householdMember, event.updatedAt);
    recordActivity("meal", t("activityDinnerRemembered").replace("{date}", dateKey));
    persistDinnerHistoryLocally();
    await Promise.all([saveDinnerHistory(), saveSharedState()]);
    render();
  },
});

const onboardingUi = createOnboardingUi({
  $,
  $$,
  storage: householdStorage,
  setView,
  openInventory: () => {
    inventoryMode = "home";
    renderInventoryMode();
  },
});

const familyUi = createFamilyUi({
  $,
  $$,
  t,
  escapeHtml,
  localize,
  formatDateKey,
  getHouseholdMember: () => householdMember,
  setHouseholdMember: (name) => {
    householdMember = cleanHouseholdMember(name) || "Family";
    householdStorage.setItem("dinner-household-member", householdMember);
    if ($("#householdMemberInput")) $("#householdMemberInput").value = householdMember;
  },
  getFamilyMembers: () => familyMembers,
  setFamilyMembers: (members) => { familyMembers = normalizeFamilyMembers(members); },
  getFamilyPreferences: () => familyPreferences,
  setFamilyPreferences: (preferences) => { familyPreferences = normalizeFamilyPreferences(preferences, familyMembers); },
  getFamilyRules: () => familyRules,
  setFamilyRules: (rules) => { familyRules = normalizeFamilyRules(rules); },
  getDinnerEvents: () => dinnerEvents,
  setDinnerEvents: (events) => { dinnerEvents = normalizeDinnerEvents(events); },
  getTodaysMeal: todaysMealPlan,
  recipeById,
  allRecipes,
  saveSharedState,
  saveDinnerEvents: saveDinnerHistory,
  recordDinnerOutcome: (event, previous) => {
    if (previous || event.status !== "cooked") return;
    const outcome = ({ loved: "loved", worked: "made", mixed: "made", skip: "skip" })[event.outcome];
    if (!outcome) return;
    event.items.forEach((item) => {
      recipeFeedback = recordRecipeOutcome(recipeFeedback, item.recipeId, outcome, householdMember, event.updatedAt);
    });
    recordActivity("meal", t("activityDinnerRemembered").replace("{date}", event.dateKey));
  },
  renderApp: render,
  setView,
  getLang: () => lang,
});

function render() {
  renderTranslations();
  renderInventoryMode();
  renderToday();
  renderSmartSuggestions();
  renderTasks();
  renderFavorites();
  renderSchedule();
  renderCalendar();
  renderGroceries();
  renderBudget();
  renderActivity();
  renderAuditHistory();
  familyUi.renderFamily();
  familyUi.renderTodayFeedback();
  renderInventory();
  renderInventorySuggestions();
  renderRecipes();
  renderDetail();
  cookAlongUi.render();
  bindOpenButtons();
  bindGroceryControls();
  bindInventoryControls();
}

function setView(viewName) {
  const viewChanged = document.body.dataset.view !== viewName;
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
  if (viewChanged) window.scrollTo({ top: 0, behavior: "auto" });
  $("#recipeDetail").hidden = true;
  $("#recipesView").classList.remove("detail-open");
  if (viewName !== "today" && $("#quickGuide") && $("#quickGuideToggle")) {
    $("#quickGuide").hidden = true;
    $("#quickGuideToggle").setAttribute("aria-expanded", "false");
  }
}

let recipeLoadInFlight = null;
const recipeDetailInFlight = new Map();
let recipeLoadGeneration = 0;
let recipeRetryTimer = 0;
let recipeRetryAttempt = 0;
const recipeRetryDelays = [2000, 10000];

function scheduleRecipeRetry() {
  const delay = recipeRetryDelays[recipeRetryAttempt];
  if (delay === undefined) {
    setSyncStatus("recipes", "sharedRecipesUnavailable", { state: "error", canRetry: true });
    return;
  }
  recipeRetryAttempt += 1;
  recipeRetryTimer = window.setTimeout(() => {
    recipeRetryTimer = 0;
    loadSharedRecipes();
  }, delay);
}

async function loadSharedRecipes({ restart = false } = {}) {
  if (restart) {
    if (recipeRetryTimer) window.clearTimeout(recipeRetryTimer);
    recipeRetryTimer = 0;
    recipeRetryAttempt = 0;
  }
  if (restart) recipeLoadGeneration += 1;
  if (recipeLoadInFlight && !restart) return recipeLoadInFlight;
  const generation = recipeLoadGeneration;
  const hasFreshCache = sharedRecipes.length && recipeCatalogFetchedAt && Date.now() - recipeCatalogFetchedAt < recipeCatalogTtlMs;
  if (hasFreshCache && !restart) {
    sharedRecipesStatus = "ready";
    render();
    return true;
  }
  if (!sharedRecipes.length) sharedRecipesStatus = "loading";
  render();
  clearAreaStatus("recipes");
  recipeLoadInFlight = (async () => {
    try {
      const data = await getJson("/.netlify/functions/recipes?view=catalog", "Could not load shared recipes.", { timeoutMs: 15000 });
      if (generation !== recipeLoadGeneration) return false;
      const remoteRecipes = Array.isArray(data.recipes) ? data.recipes : [];
      const catalog = new Map(recipes.map((recipe) => [recipe.id, seedRecipeCatalogRecord(recipe)]));
      remoteRecipes.forEach((recipe) => catalog.set(recipe.id, recipe));
      sharedRecipes = [...catalog.values()];
      persistRecipeCatalog(sharedRecipes);
      sharedRecipesStatus = "ready";
      recipeRetryAttempt = 0;
      if (recipeRetryTimer) window.clearTimeout(recipeRetryTimer);
      recipeRetryTimer = 0;
      render();
      return true;
    } catch (error) {
      console.warn(error);
      if (generation !== recipeLoadGeneration) return false;
      sharedRecipesStatus = sharedRecipes.length ? "ready" : "unavailable";
      scheduleRecipeRetry();
      return false;
    } finally {
      if (generation === recipeLoadGeneration) recipeLoadInFlight = null;
    }
  })();
  return recipeLoadInFlight;
}

async function loadRecipeDetail(id) {
  if (!id || recipeDetailInFlight.has(id)) return recipeDetailInFlight.get(id);
  const request = getJson(`/.netlify/functions/recipes?id=${encodeURIComponent(id)}`, "Could not load recipe details.", { timeoutMs: 15000 })
    .then((data) => {
      if (!data?.recipe || data.recipe.id !== id) return false;
      const index = sharedRecipes.findIndex((recipe) => recipe.id === id);
      if (index < 0) return false;
      sharedRecipes = [...sharedRecipes.slice(0, index), data.recipe, ...sharedRecipes.slice(index + 1)];
      renderDetail();
      return true;
    })
    .catch((error) => {
      console.warn(error);
      return false;
    })
    .finally(() => recipeDetailInFlight.delete(id));
  recipeDetailInFlight.set(id, request);
  return request;
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
        groceryBaseItems = cloneVersionedItems(items);
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

async function saveGroceries({ retrying = false } = {}) {
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
    groceryBaseItems = cloneVersionedItems(groceries);
    markSynced("groceries");
    return true;
  } catch (error) {
    console.warn(error);
    const localGroceries = groceries;
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
      groceries = mergeVersionedItems(localGroceries, groceryBaseItems, error.data.items);
      persistGroceriesLocally(groceries, groceryVersion);
      if (!retrying) return saveGroceries({ retrying: true });
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
        inventoryBaseItems = cloneVersionedItems(items);
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

async function saveInventory({ retrying = false } = {}) {
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
    inventoryBaseItems = cloneVersionedItems(inventory);
    markSynced("inventory");
    return true;
  } catch (error) {
    console.warn(error);
    const localInventory = inventory;
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
      inventory = mergeVersionedItems(localInventory, inventoryBaseItems, error.data.items);
      persistInventoryLocally(inventory, inventoryVersion);
      if (!retrying) return saveInventory({ retrying: true });
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

function translationResultReady(recipe, translated, targetLang) {
  if (targetLang !== "es") return true;
  const required = [
    ["name", recipe?.name],
    ["ingredientsText", recipe?.ingredientsText],
    ["stepsText", recipe?.stepsText],
  ];
  if (required.some(([field, source]) => source && !translated?.[field])) return false;
  if (required.some(([field, source]) => source && !textMatchesLanguage(translated[field], targetLang))) return false;
  return ["allergyWarning", "notes"].every((field) => (
    !recipe?.[field] || !translated?.[field] || textMatchesLanguage(translated[field], targetLang)
  ));
}

async function backfillRecipeLocale(recipeId, targetLang) {
  const recipe = rawRecipeById(recipeId);
  if (!recipe || !rawRecipeNeedsLocale(recipe, targetLang)) return true;

  const sourceLang = recipeTranslationSourceLang(recipe, targetLang);
  if (!sourceLang || sourceLang === targetLang) return false;

  let translated = await translateRecipeContent(recipe, sourceLang, targetLang);
  if (!translationResultReady(recipe, translated, targetLang)) {
    translated = await translateRecipeContent(recipe, sourceLang, targetLang);
  }
  if (!translationResultReady(recipe, translated, targetLang)) {
    throw new Error(t("recipeTranslationIncomplete"));
  }
  const nextEdit = mergeTranslatedRecipeEdit(recipe, translated, targetLang);
  const draftIndex = drafts.findIndex((draft) => draft.id === recipeId);

  if (draftIndex >= 0) {
    drafts = drafts.map((draft, index) => (index === draftIndex ? { ...draft, ...nextEdit } : draft));
    persistDrafts();
    render();
    return true;
  }

  recipeEdits[recipeId] = nextEdit;
  saveSharedStateLocally();
  render();
  return saveSharedState();
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
  return {
    items: Array.isArray(data.items) ? data.items : [],
    receipt: data.receipt && typeof data.receipt === "object" ? data.receipt : null,
  };
}

$$("[data-lang]").forEach((button) => {
  button.addEventListener("click", () => {
    lang = supportedLang(button.dataset.lang);
    localStorage.setItem("dinner-lang", lang);
    render();
  });
});

$("#householdMemberInput").addEventListener("change", (event) => {
  const previousMember = householdMember;
  householdMember = cleanHouseholdMember(event.target.value) || "Family";
  householdStorage.setItem("dinner-household-member", householdMember);
  if ($("#taskAssigneeInput") && ["", previousMember].includes($("#taskAssigneeInput").value.trim())) {
    $("#taskAssigneeInput").value = householdMember;
  }
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
  button.addEventListener("click", () => {
    if (button.dataset.view === "schedule") scheduleUi.closeFocusedDinner();
    setView(button.dataset.view);
  });
});

$$('[data-view-target]').forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.viewTarget === "schedule") scheduleUi.closeFocusedDinner();
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

$("#translateSelectedRecipe").addEventListener("click", async () => {
  const recipeId = selectedRecipeId;
  const targetLang = lang;
  const key = `${recipeId}:${targetLang}`;
  if (recipeTranslationInFlight.has(key)) return;

  recipeTranslationInFlight.add(key);
  renderDetail();
  setDetailStatus(t("translatingRecipe"));
  let resultMessage = "";
  let resultIsError = false;

  try {
    const saved = await backfillRecipeLocale(recipeId, targetLang);
    resultMessage = t(saved ? "recipeTranslationReady" : "recipeTranslationSaveError");
    resultIsError = !saved;
  } catch (error) {
    console.warn(error);
    resultMessage = error.message ? `${t("recipeTranslationError")} ${error.message}` : t("recipeTranslationError");
    resultIsError = true;
  } finally {
    recipeTranslationInFlight.delete(key);
    renderDetail();
    setDetailStatus(resultMessage, resultIsError);
  }
});

scheduleUi.bindScheduleControls();

dashboardUi.bindDashboardControls();

$("#startCooking").addEventListener("click", () => {
  const recipe = recipeById(selectedRecipeId);
  if (recipe) cookAlongUi.start(recipe);
});

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
  const recipeId = selectedRecipeId;
  const incoming = recipeGroceries(recipeById(recipeId));
  const merged = mergeGroceries(groceries, incoming);
  const addedCount = merged.length - groceries.length;
  const atHomeCount = incoming.filter((item) => item.inventorySuggested).length;
  groceries = merged;
  render();
  inventoryMode = "shopping";
  renderInventoryMode();
  groceryUi.showRecipe(recipeId);
  setView("grocery");
  $("#groceryStatus").textContent = detailGroceriesMessage(addedCount, atHomeCount);
  const saved = await saveGroceries();
  if (!saved) $("#groceryStatus").textContent = t("recipeGroceriesError");
});

recipeFormUi.bind();
onboardingUi.bind();
familyUi.bind();
$("#householdMenuName").textContent = household.name;
$("#currentHouseholdKey").value = household.key;
$("#copyHouseholdKey").addEventListener("click", async () => {
  const status = $("#householdMenuStatus");
  try {
    await navigator.clipboard.writeText(household.key);
    status.textContent = "Family key copied.";
  } catch {
    $("#currentHouseholdKey").type = "text";
    $("#currentHouseholdKey").select();
    status.textContent = "Key selected. Copy it from the field.";
  }
});
$("#leaveHousehold").addEventListener("click", () => {
  if (window.confirm("Use a different household? Make sure this family key is saved first.")) leaveHousehold();
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
  recordActivity("grocery", t("activityGroceryAdded").replace("{item}", text));
  await Promise.all([saveGroceries(), saveSharedState()]);
});

$("#generateGroceries").addEventListener("click", async () => {
  groceries = applyInventoryCoverage(
    replacePlannedGroceries(groceries, generatedGroceriesFromPlan($("#groceryPlanRange").value)),
    inventory,
  );
  renderGroceries();
  bindGroceryControls();
  recordActivity("grocery", t("activityShoppingBuilt"));
  await Promise.all([saveGroceries(), saveSharedState()]);
});

$("#clearCheckedGroceries").addEventListener("click", async () => {
  $(".grocery-tools-menu").open = false;
  groceries = groceries.filter((item) => !item.checked);
  renderGroceries();
  bindGroceryControls();
  await saveGroceries();
});

receiptUi.bindReceiptControls();
budgetUi.bindBudgetControls();

function openFinishShopping({ showReceipt = false } = {}) {
  $("#finishShoppingPanel").hidden = false;
  $("#finishShoppingPrompt").hidden = true;
  $("#manualReceiptDate").value ||= formatDateKey(new Date());
  if (showReceipt) {
    $("#receiptScanPanel").hidden = false;
    $("#scanReceiptToggle").setAttribute("aria-expanded", "true");
  }
  document.body.classList.add("finish-shopping-open");
  $("#finishShoppingPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#quickReceiptUpload").addEventListener("click", () => {
  openFinishShopping({ showReceipt: true });
});

$("#restockPurchased").addEventListener("click", () => {
  openFinishShopping();
});

$("#closeFinishShopping").addEventListener("click", () => {
  closeFinishShoppingPanel();
  renderGroceries();
  bindGroceryControls();
});

$("#finishWithoutReceipt").addEventListener("click", async () => {
  if (!purchasedGroceries().length) {
    setSyncStatus("groceries", "checkPurchasedFirst", { state: "error" });
    return;
  }

  movePurchasedItemsHome();
  showHomeAfterTrip();
  renderGroceries();
  renderInventory();
  bindGroceryControls();
  bindInventoryControls();
  await Promise.all([saveInventory(), saveGroceries()]);
});

$("#manualReceiptForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const purchasedCount = purchasedGroceries().length;
  if (!purchasedCount) {
    setSyncStatus("groceries", "checkPurchasedFirst", { state: "error" });
    return;
  }

  const total = Number($("#manualReceiptTotal").value);
  if (!(total > 0)) return;

  await addHouseholdReceipt({
    store: $("#manualReceiptStore").value.trim(),
    date: $("#manualReceiptDate").value || formatDateKey(new Date()),
    total,
    itemCount: purchasedCount,
  });
  movePurchasedItemsHome();
  $("#manualReceiptForm").reset();
  showHomeAfterTrip();
  renderGroceries();
  renderInventory();
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
    "",
    $("#inventoryLocationInput").value,
    photos,
    "some",
    lang,
    householdMember,
    {
      amount: $("#inventoryQuantityInput").value,
      unit: $("#inventoryUnitInput").value,
      expiresOn: $("#inventoryExpirationInput").value,
    }
  ));
  $("#inventoryInput").value = "";
  $("#inventoryQuantityInput").value = "";
  $("#inventoryUnitInput").value = "each";
  $("#inventoryExpirationInput").value = "";
  $("#inventoryPhotoInput").value = "";
  updateFileInputStatus($("#inventoryPhotoInput"));
  renderInventory();
  bindInventoryControls();
  recordActivity("inventory", t("activityInventoryAdded").replace("{item}", text));
  await Promise.all([saveInventory(), saveSharedState()]);
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

$("#retrySharedState").addEventListener("click", async () => {
  if (sharedRetryAction) await sharedRetryAction();
});

$("#retryRecipes").addEventListener("click", () => loadSharedRecipes({ restart: true }));
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-retry-recipe-catalog]")) loadSharedRecipes({ restart: true });
});

$("#rotateHouseholdKey")?.addEventListener("click", async () => {
  const code = $("#householdRotationCode")?.value.trim();
  if (!code) return;
  const button = $("#rotateHouseholdKey");
  button.disabled = true;
  try {
    const data = await putJson("/.netlify/functions/households", { rotateKey: true, rotationCode: code }, "Could not rotate the family key.");
    localStorage.setItem("family-menu-household-key", data.key);
    $("#currentHouseholdKey").value = data.key;
    $("#householdMenuStatus").textContent = "New family key created. Share it privately with trusted household members.";
  } catch (error) {
    $("#householdMenuStatus").textContent = error.message || "Could not rotate the family key.";
  } finally {
    button.disabled = false;
  }
});
$("#retryGroceries").addEventListener("click", saveGroceries);
$("#retryInventory").addEventListener("click", saveInventory);

window.addEventListener("online", () => {
  const retries = [];
  if (!$("#retrySharedState").hidden && sharedRetryAction) retries.push(sharedRetryAction());
  if (!$("#retryRecipes").hidden) retries.push(loadSharedRecipes({ restart: true }));
  if (!$("#retryGroceries").hidden) retries.push(saveGroceries());
  if (!$("#retryInventory").hidden) retries.push(saveInventory());
  if (dinnerHistoryPending) retries.push(saveDinnerHistory());
  Promise.allSettled(retries);
});

bindInstallPrompt({ $, t });
registerServiceWorker({ $, onUpdateAvailable: showAppUpdateNotice });

setupLocalizedFileInputs();
render();
loadSharedRecipes().then(() => loadSharedState()).then(() => loadSchedule()).then(() => Promise.all([loadLedger("receipts"), loadLedger("activity")]));
$("#householdHistoryPanel")?.addEventListener("toggle", (event) => {
  if (event.target.open && !event.target.dataset.loaded) {
    event.target.dataset.loaded = "true";
    loadAuditHistory();
  }
});
loadDinnerHistory();
loadGroceries();
loadInventory();
