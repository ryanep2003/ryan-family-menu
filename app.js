import {
  cleanIngredientForGrocery,
  groceryItem,
  groceryItemsFromRecipe,
  inventoryMatchFor as findInventoryMatch,
  mergeGroceries,
} from "./grocery-logic.js";
import {
  normalizeSharedState,
  persistSharedState,
  sharedStateSnapshot as familyStateSnapshot,
} from "./family-state.js";
import { inventoryItem, mergeInventory } from "./inventory-logic.js";
import { getJson, postJson, putJson } from "./api.js";
import { createGroceryUi } from "./grocery-ui.js";
import { createInventoryUi } from "./inventory-ui.js";
import { readFilesAsDataUrls } from "./images.js";
import { createRecipeFormUi } from "./recipe-form-ui.js";
import { createRecipeLibraryUi } from "./recipe-library-ui.js";
import { recipes } from "./recipes-data.js";
import { createScheduleUi } from "./schedule-ui.js";
import { translations } from "./translations.js";
import {
  categoryFor,
  categoryLabel as localizedCategoryLabel,
  recipeToEditableUpload as recipeToEditable,
  uploadToRecipe,
} from "./recipe-utils.js";
import {
  activeWeekDateKeys as dateKeysForWeek,
  currentWeekStartKey,
  days,
  emptyMeal,
  formatDateKey,
  mealHasContent,
  normalizeCalendar,
  normalizeMealPlan,
  normalizeSchedule,
} from "./schedule-utils.js";

const mealSlots = [
  { key: "main", label: "mainSlot", choose: "chooseMain", categories: ["main"] },
  { key: "side", label: "sideSlot", choose: "chooseSide", categories: ["side", "sauce"] },
  { key: "salad", label: "saladSlot", choose: "chooseSalad", categories: ["salad"] },
];

let lang = localStorage.getItem("dinner-lang") || "en";
let selectedRecipeId = "meatballs";
let schedule = normalizeSchedule(JSON.parse(localStorage.getItem("dinner-schedule") || "null"));
let calendarMeals = normalizeCalendar(JSON.parse(localStorage.getItem("dinner-calendar") || "null") || {});
let weekStartKey = localStorage.getItem("dinner-week-start") || currentWeekStartKey();
let sharedStateVersion = Number(localStorage.getItem("dinner-state-version") || 0);
let favorites = JSON.parse(localStorage.getItem("dinner-favorites") || "[]");
let tasks = JSON.parse(localStorage.getItem("dinner-tasks") || "[]");
let drafts = JSON.parse(localStorage.getItem("dinner-drafts") || "[]");
let sharedRecipes = [];
let recipeEdits = JSON.parse(localStorage.getItem("dinner-recipe-edits") || "{}");
let deletedRecipeIds = JSON.parse(localStorage.getItem("dinner-deleted-recipes") || "[]");
let importedRecipePhotos = [];
let groceries = [];
let groceryVersion = 0;
let inventory = [];
let inventoryVersion = 0;
let inventorySuggestions = [];
let receiptSuggestions = [];
let inventoryMode = "shopping";
let inventoryFilter = "all";
let visibleMonth = new Date();
visibleMonth.setDate(1);
let deferredPrompt = null;
let recipeSearch = "";
let categoryFilter = "all";
let hadServiceWorkerController = false;
let appUpdateNoticeShown = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function t(key) {
  return translations[lang][key] || translations.en[key] || key;
}

function allRecipes() {
  return [
    ...recipes,
    ...sharedRecipes.map((recipe) => uploadToRecipe(recipe, "Shared upload", "Receta compartida")),
    ...drafts.map((draft) => uploadToRecipe(draft, "Local draft", "Borrador local")),
  ]
    .filter((recipe) => !deletedRecipeIds.includes(recipe.id))
    .map((recipe) => {
      const edit = recipeEdits[recipe.id];
      if (!edit) return recipe;
      return uploadToRecipe(edit, recipe.meta?.en || localize(recipe.meta), recipe.meta?.es || localize(recipe.meta));
    });
}

function recipeById(id) {
  return allRecipes().find((recipe) => recipe.id === id) || allRecipes()[0] || recipes[0];
}

function draftById(id) {
  return drafts.find((draft) => draft.id === id) || null;
}

function persistDrafts() {
  localStorage.setItem("dinner-drafts", JSON.stringify(drafts));
}

function recipeToEditableUpload(recipe) {
  return recipeToEditable(recipe, lang, localize);
}

function updateMealsAfterRecipeDelete(recipeId) {
  const clearMeal = (meal) => Object.fromEntries(
    Object.entries(normalizeMealPlan(meal)).map(([key, value]) =>
      mealSlots.some((slot) => slot.key === key) && value === recipeId ? [key, ""] : [key, value])
  );

  schedule = normalizeSchedule(Object.fromEntries(days.map((day) => [day.key, clearMeal(schedule[day.key])])));
  calendarMeals = Object.fromEntries(
    Object.entries(calendarMeals).map(([dateKey, meal]) => [dateKey, clearMeal(meal)])
  );
}

function localize(value) {
  if (typeof value === "string") return value;
  return value[lang] || value.en || "";
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
    const status = $("#sharedStateStatus");
    if (status) status.textContent = "";
  } catch (error) {
    console.warn(error);
    const status = $("#sharedStateStatus");
    if (error.status === 409 && error.data?.state) {
      sharedStateVersion = Number(error.data.version) || sharedStateVersion;
      applySharedState(normalizeSharedState(error.data.state, currentSharedState()));
      saveSharedStateLocally();
      render();
      if (status) status.textContent = t("sharedStateConflict");
      return;
    }
    if (status) status.textContent = t("sharedStateError");
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
    if (rolledForward || missingWeekStart) await saveSharedState();
  } catch (error) {
    console.warn(error);
  }
}

function todaysRecipeId() {
  return todaysMealPlan().main || "meatballs";
}

function todaysMealPlan() {
  return calendarMealForDateKey(formatDateKey(new Date()));
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
  if (!items.length) return t("noMealSet");
  return items.map(({ recipe }) => localize(recipe.name)).join(" · ");
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
  return groceryItemsFromRecipe(recipe, lang, inventory).map((item) => ({
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
  localize,
  groceryStoreLabel,
  inventoryLocationLabel,
  saveGroceries,
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
  getInventory: () => inventory,
  setInventory: (items) => {
    inventory = items;
  },
  getGroceries: () => groceries,
  setGroceries: (items) => {
    groceries = items;
  },
  getInventoryMode: () => inventoryMode,
  setInventoryMode: (mode) => {
    inventoryMode = mode;
  },
  getInventoryFilter: () => inventoryFilter,
  getInventorySuggestions: () => inventorySuggestions,
  setInventorySuggestions: (items) => {
    inventorySuggestions = items;
  },
});

const renderInventoryMode = () => inventoryUi.renderInventoryMode();
const renderInventory = () => inventoryUi.renderInventory();
const bindInventoryControls = () => inventoryUi.bindInventoryControls();
const renderInventorySuggestions = () => inventoryUi.renderInventorySuggestions();

function renderReceiptSuggestions() {
  const panel = $("#receiptSuggestions");
  if (!panel) return;

  if (!receiptSuggestions.length) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }

  panel.hidden = false;
  panel.innerHTML = `
    <h3>${t("receiptSuggestionsHeading")}</h3>
    <div class="suggestion-list">
      ${receiptSuggestions.map((item, index) => `
        <label class="suggestion-item">
          <input type="checkbox" data-receipt-suggestion="${index}" checked />
          <span>
            <strong>${escapeHtml(item.text)}</strong>
            <em>${escapeHtml([item.quantity, item.matchText ? `${t("receiptMatch")}: ${item.matchText}` : t("receiptNewItem")].filter(Boolean).join(" · "))}</em>
          </span>
        </label>
      `).join("")}
    </div>
    <button class="primary-action" type="button" id="addReceiptSuggestions">${t("addSelectedReceipt")}</button>
  `;

  $("#addReceiptSuggestions").addEventListener("click", async () => {
    const selected = $$("[data-receipt-suggestion]")
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => receiptSuggestions[Number(checkbox.dataset.receiptSuggestion)])
      .filter(Boolean);

    if (!selected.length) return;

    const matchedIds = new Set(selected.map((item) => item.matchId).filter(Boolean));
    inventory = mergeInventory(inventory, selected.map((item) => inventoryItem(
      item.matchText || item.text,
      item.quantity,
      $("#receiptScanLocationInput").value,
      [],
      "full"
    )));
    groceries = groceries.filter((item) => !matchedIds.has(item.id));
    receiptSuggestions = [];
    $("#groceryStatus").textContent = t("receiptItemsMoved");
    renderReceiptSuggestions();
    renderGroceries();
    renderInventory();
    bindInventoryControls();
    await Promise.all([saveInventory(), saveGroceries()]);
  });
}

function renderTranslations() {
  document.documentElement.lang = lang;
  $$("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  $$("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  $$("[data-lang]").forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === lang);
  });
}

function showAppUpdateNotice() {
  if (appUpdateNoticeShown) return;
  const notice = $("#appUpdateNotice");
  if (!notice) return;
  appUpdateNoticeShown = true;
  notice.hidden = false;
}

function installInstructions() {
  const platform = navigator.userAgent || "";
  const isAndroid = /Android/i.test(platform);
  const isIos = /iPhone|iPad|iPod/i.test(platform);
  if (isAndroid) return t("installInstructionsAndroid");
  if (isIos) return t("installInstructionsIos");
  return t("installInstructions");
}

function renderToday() {
  const meal = todaysMealPlan();
  const mainRecipe = meal.main ? recipeById(meal.main) : null;
  const recipesForMeal = mealRecipes(meal);
  $("#todayRecipeName").textContent = mainRecipe ? localize(mainRecipe.name) : t("noMealSet");
  $("#todayMeta").textContent = recipesForMeal.length
    ? `${recipesForMeal.length} ${lang === "en" ? "planned item(s)" : "receta(s) planeadas"}${mealHasWarning(meal) ? ` · ${t("allergyBadge")}` : ""}`
    : t("noMealSet");
  $("#todayMealList").innerHTML = recipesForMeal
    .map(({ key, recipe }) => `
      <button type="button" data-open="${recipe.id}">
        <span>${t(`${key}Slot`)}</span>
        <strong>${escapeHtml(localize(recipe.name))}</strong>
        ${recipe.allergyWarning ? `<em>${t("allergyBadge")}</em>` : ""}
      </button>
    `)
    .join("");
  const toBuy = groceries.filter((item) => !item.checked && !item.inInventory).length;
  $("#todayGrocerySummary").textContent = `${toBuy} ${t("itemsToBuy")}`;
  $("#todayInventorySummary").textContent = `${inventory.filter((item) => item.stockState !== "out").length} ${t("itemsAtHome")}`;
  $("#cookToday").disabled = !mainRecipe;
}

function taskAssigneeLabel(assignee) {
  const labels = {
    alyson: "assigneeAlyson",
    eric: "assigneeEric",
    nelly: "assigneeNelly",
    theo: "assigneeTheo",
    pierce: "assigneePierce",
    other: "assigneeOther",
  };
  return t(labels[assignee] || labels.other);
}

function todaysTasks() {
  const todayKey = formatDateKey(new Date());
  return tasks.filter((task) => task.date === todayKey);
}

function renderTasks() {
  const currentTasks = todaysTasks();
  const completed = currentTasks.filter((task) => task.completed).length;
  $("#taskProgress").textContent = currentTasks.length ? `${completed}/${currentTasks.length}` : "";

  $("#taskList").innerHTML = currentTasks.length
    ? currentTasks.map((task) => `
        <div class="task-item${task.completed ? " completed" : ""}">
          <label>
            <input type="checkbox" data-task-id="${escapeHtml(task.id)}" ${task.completed ? "checked" : ""} />
            <span>
              <strong>${escapeHtml(task.text)}</strong>
              <small>${escapeHtml(taskAssigneeLabel(task.assignee))}</small>
            </span>
          </label>
          <button class="icon-remove" type="button" data-remove-task="${escapeHtml(task.id)}" aria-label="${t("remove")}">×</button>
        </div>
      `).join("")
    : `<p class="empty-state compact">${t("tasksEmpty")}</p>`;

  $$('[data-task-id]').forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      const task = tasks.find((item) => item.id === checkbox.dataset.taskId);
      if (!task) return;
      task.completed = checkbox.checked;
      renderTasks();
      await saveSharedState();
    });
  });

  $$('[data-remove-task]').forEach((button) => {
    button.addEventListener("click", async () => {
      tasks = tasks.filter((task) => task.id !== button.dataset.removeTask);
      renderTasks();
      await saveSharedState();
    });
  });
}

function nextOpenMealDate() {
  const start = new Date();
  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const dateKey = formatDateKey(date);
    const meal = calendarMealForDateKey(dateKey);
    if (!meal.main) return { dateKey, meal };
  }
  return { dateKey: formatDateKey(start), meal: todaysMealPlan() };
}

function renderFavorites() {
  const favoriteRecipes = favorites
    .map((id) => allRecipes().find((recipe) => recipe.id === id))
    .filter(Boolean);
  $("#favoriteList").innerHTML = favoriteRecipes.length
    ? favoriteRecipes.map((recipe) => `
        <div class="favorite-item">
          <button class="favorite-open" type="button" data-open="${recipe.id}">
            <img src="${recipe.photos[0]}" alt="" />
            <span>
              <strong>${escapeHtml(localize(recipe.name))}</strong>
              <small>${escapeHtml(categoryLabel(categoryFor(recipe)))}</small>
            </span>
          </button>
          <button class="ghost-button compact-button" type="button" data-plan-favorite="${recipe.id}">${t("planNextOpen")}</button>
        </div>
      `).join("")
    : `<p class="empty-state compact">${t("favoritesEmpty")}</p>`;

  $$('[data-plan-favorite]').forEach((button) => {
    button.addEventListener("click", async () => {
      const target = nextOpenMealDate();
      calendarMeals[target.dateKey] = { ...target.meal, main: button.dataset.planFavorite };
      render();
      await saveSharedState();
    });
  });
}

const scheduleUi = createScheduleUi({
  $,
  $$,
  t,
  escapeHtml,
  localize,
  formatDateKey,
  normalizeMealPlan,
  mealSlots,
  days,
  emptyMeal,
  categoryFor,
  activeWeekDateKeys,
  calendarMealForDateKey,
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
});

const renderRecipes = () => recipeLibraryUi.renderRecipes();
const renderDetail = () => recipeLibraryUi.renderDetail();
const bindOpenButtons = () => recipeLibraryUi.bindOpenButtons();

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
}

function setView(viewName) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `${viewName}View`));
  $$(".tabs button").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  $("#recipeDetail").hidden = true;
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
    const data = await getJson("/.netlify/functions/groceries", "Could not load groceries.");
    groceries = Array.isArray(data.items) ? data.items : [];
    groceryVersion = Number(data.version) || 0;
    render();
  } catch (error) {
    console.warn(error);
    $("#groceryStatus").textContent = t("groceryError");
    $("#groceryStatus").classList.add("error");
  }
}

async function saveGroceries() {
  try {
    const data = await putJson(
      "/.netlify/functions/groceries",
      { items: groceries, version: groceryVersion },
      "Could not save groceries."
    );
    groceries = Array.isArray(data.items) ? data.items : groceries;
    groceryVersion = Number(data.version) || groceryVersion;
    $("#groceryStatus").textContent = t("grocerySaved");
    $("#groceryStatus").classList.remove("error");
    return true;
  } catch (error) {
    console.warn(error);
    if (error.status === 409 && Array.isArray(error.data?.items)) {
      groceries = error.data.items;
      groceryVersion = Number(error.data.version) || groceryVersion;
      renderGroceries();
      bindGroceryControls();
      $("#groceryStatus").textContent = t("groceryConflict");
      $("#groceryStatus").classList.add("error");
      return false;
    }
    $("#groceryStatus").textContent = t("groceryError");
    $("#groceryStatus").classList.add("error");
    return false;
  }
}

async function loadInventory() {
  try {
    const data = await getJson("/.netlify/functions/inventory", "Could not load inventory.");
    inventory = Array.isArray(data.items) ? data.items : [];
    inventoryVersion = Number(data.version) || 0;
    render();
  } catch (error) {
    console.warn(error);
    $("#inventoryStatus").textContent = t("inventoryError");
    $("#inventoryStatus").classList.add("error");
  }
}

async function saveInventory() {
  try {
    const data = await putJson(
      "/.netlify/functions/inventory",
      { items: inventory, version: inventoryVersion },
      "Could not save inventory."
    );
    inventory = Array.isArray(data.items) ? data.items : inventory;
    inventoryVersion = Number(data.version) || inventoryVersion;
    $("#inventoryStatus").textContent = t("inventorySaved");
    $("#inventoryStatus").classList.remove("error");
  } catch (error) {
    console.warn(error);
    if (error.status === 409 && Array.isArray(error.data?.items)) {
      inventory = error.data.items;
      inventoryVersion = Number(error.data.version) || inventoryVersion;
      renderInventory();
      bindInventoryControls();
      $("#inventoryStatus").textContent = t("inventoryConflict");
      $("#inventoryStatus").classList.add("error");
      return;
    }
    $("#inventoryStatus").textContent = t("inventoryError");
    $("#inventoryStatus").classList.add("error");
  }
}

async function recognizeInventory(images, location) {
  const data = await postJson(
    "/.netlify/functions/recognize-inventory",
    { images, location },
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
  const data = await postJson("/.netlify/functions/recognize-receipt", { images }, t("receiptScanError"));
  return Array.isArray(data.items) ? data.items : [];
}

$$("[data-lang]").forEach((button) => {
  button.addEventListener("click", () => {
    lang = button.dataset.lang;
    localStorage.setItem("dinner-lang", lang);
    render();
  });
});

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

$$("[data-inventory-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    inventoryFilter = button.dataset.inventoryFilter;
    $$("[data-inventory-filter]").forEach((filterButton) => {
      filterButton.classList.toggle("active", filterButton.dataset.inventoryFilter === inventoryFilter);
    });
    renderInventory();
    bindInventoryControls();
  });
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

$("#taskForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = $("#taskInput").value.trim();
  if (!text) return;

  tasks.unshift({
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    assignee: $("#taskAssigneeInput").value,
    date: formatDateKey(new Date()),
    completed: false,
    createdAt: new Date().toISOString(),
  });
  $("#taskInput").value = "";
  renderTasks();
  await saveSharedState();
});

$("#favoriteRecipe").addEventListener("click", async () => {
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

  const button = $("#publishDraftRecipe");
  button.disabled = true;
  setDetailStatus(t("publishingDraftRecipe"));

  try {
    const recipe = recipeToEditableUpload(recipeById(selectedRecipeId));
    const saved = await saveSharedRecipe(recipe);
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

$("#cookToday").addEventListener("click", () => {
  const mainRecipe = todaysMealPlan().main;
  if (!mainRecipe) return;
  selectedRecipeId = mainRecipe;
  renderDetail();
  $("#recipeDetail").hidden = false;
  $("#recipeDetail").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("#markCooked").addEventListener("click", () => {
  $("#markCooked").textContent = lang === "en" ? "Cooked today" : "Hecha hoy";
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
  groceries = mergeGroceries(groceries, generatedGroceriesFromWeek());
  renderGroceries();
  bindGroceryControls();
  await saveGroceries();
});

$("#clearCheckedGroceries").addEventListener("click", async () => {
  groceries = groceries.filter((item) => !item.checked);
  renderGroceries();
  bindGroceryControls();
  await saveGroceries();
});

$("#scanReceiptToggle").addEventListener("click", () => {
  $("#receiptScanPanel").hidden = !$("#receiptScanPanel").hidden;
});

$("#receiptScanForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const files = $("#receiptScanPhotoInput").files;
  if (!files.length) return;

  const submitButton = $("#receiptScanForm .primary-action");
  const status = $("#groceryStatus");
  submitButton.disabled = true;
  status.textContent = t("receiptScanWorking");
  status.classList.remove("error");

  try {
    const images = await readFilesAsDataUrls(files, 4, {
      maxSide: 1100,
      quality: 0.74,
      maxBytes: 650000,
    });
    const items = await recognizeReceipt(images);
    receiptSuggestions = items.map((item) => {
      const match = shoppingMatchForReceiptItem(item.text);
      return {
        ...item,
        matchId: match?.id || "",
        matchText: match?.text || "",
      };
    });
    $("#receiptScanPhotoInput").value = "";
    renderReceiptSuggestions();
    status.textContent = receiptSuggestions.length ? "" : t("receiptScanEmpty");
  } catch (error) {
    console.warn(error);
    receiptSuggestions = [];
    renderReceiptSuggestions();
    status.textContent = error.message || t("receiptScanError");
    status.classList.add("error");
  } finally {
    submitButton.disabled = false;
  }
});

$("#restockPurchased").addEventListener("click", async () => {
  const purchased = purchasedGroceries();
  if (!purchased.length) return;

  purchased.forEach((grocery) => {
    const existing = inventoryMatchFor(grocery.text, true);
    if (existing) {
      existing.stockState = "full";
      existing.updatedAt = new Date().toISOString();
    } else {
      inventory.unshift(inventoryItem(grocery.text, "", "pantry", [], "full"));
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
    photos
  ));
  $("#inventoryInput").value = "";
  $("#inventoryQuantityInput").value = "";
  $("#inventoryPhotoInput").value = "";
  renderInventory();
  bindInventoryControls();
  await saveInventory();
});

$("#inventoryScanForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const files = $("#inventoryScanPhotoInput").files;
  if (!files.length) return;

  const submitButton = $("#inventoryScanForm .primary-action");
  const status = $("#inventoryStatus");
  submitButton.disabled = true;
  status.textContent = t("inventoryScanWorking");
  status.classList.remove("error");

  try {
    const images = await readFilesAsDataUrls(files, 6);
    inventorySuggestions = await recognizeInventory(images, $("#inventoryScanLocationInput").value);
    $("#inventoryScanPhotoInput").value = "";
    renderInventorySuggestions();
    status.textContent = inventorySuggestions.length ? "" : t("inventoryScanEmpty");
  } catch (error) {
    console.warn(error);
    inventorySuggestions = [];
    renderInventorySuggestions();
    status.textContent = error.message || t("inventoryScanError");
    status.classList.add("error");
  } finally {
    submitButton.disabled = false;
  }
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
});

$("#installButton").addEventListener("click", async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt = null;
    return;
  }

  window.alert(installInstructions());
});

$("#refreshApp").addEventListener("click", () => {
  window.location.reload();
});

if ("serviceWorker" in navigator) {
  hadServiceWorkerController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadServiceWorkerController) showAppUpdateNotice();
    hadServiceWorkerController = true;
  });

  navigator.serviceWorker.register("service-worker.js").then((registration) => {
    registration.update();
    if (registration.waiting && navigator.serviceWorker.controller) {
      showAppUpdateNotice();
    }

    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;

      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          showAppUpdateNotice();
        }
      });
    });
  });
}

render();
loadSharedState();
loadSharedRecipes();
loadGroceries();
loadInventory();
