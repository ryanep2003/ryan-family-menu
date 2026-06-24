import {
  cleanIngredientForGrocery,
  groceryItem,
  groceryItemsFromRecipe,
  inventoryMatchFor as findInventoryMatch,
  mergeGroceries,
} from "./grocery-logic.js";
import { inventoryItem, mergeInventory } from "./inventory-logic.js";
import { getJson, postJson, putJson } from "./api.js";
import { createGroceryUi } from "./grocery-ui.js";
import { createInventoryUi } from "./inventory-ui.js";
import { readFilesAsDataUrls } from "./images.js";
import { createRecipeFormUi } from "./recipe-form-ui.js";
import { recipes } from "./recipes-data.js";
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
  return { weekStart: weekStartKey, schedule, calendarMeals, favorites, tasks, recipeEdits, deletedRecipeIds };
}

function saveSharedStateLocally() {
  localStorage.setItem("dinner-schedule", JSON.stringify(schedule));
  localStorage.setItem("dinner-calendar", JSON.stringify(calendarMeals));
  localStorage.setItem("dinner-week-start", weekStartKey);
  localStorage.setItem("dinner-state-version", `${sharedStateVersion}`);
  localStorage.setItem("dinner-favorites", JSON.stringify(favorites));
  localStorage.setItem("dinner-tasks", JSON.stringify(tasks));
  localStorage.setItem("dinner-recipe-edits", JSON.stringify(recipeEdits));
  localStorage.setItem("dinner-deleted-recipes", JSON.stringify(deletedRecipeIds));
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
      schedule = normalizeSchedule(data.state.schedule);
      calendarMeals = normalizeCalendar(data.state.calendarMeals);
      weekStartKey = data.state.weekStart || weekStartKey;
      favorites = Array.isArray(data.state.favorites) ? data.state.favorites : favorites;
      tasks = Array.isArray(data.state.tasks) ? data.state.tasks : tasks;
      recipeEdits = data.state.recipeEdits && typeof data.state.recipeEdits === "object" ? data.state.recipeEdits : recipeEdits;
      deletedRecipeIds = Array.isArray(data.state.deletedRecipeIds) ? data.state.deletedRecipeIds : deletedRecipeIds;
      saveSharedStateLocally();
    }
    const status = $("#sharedStateStatus");
    if (status) status.textContent = "";
  } catch (error) {
    console.warn(error);
    const status = $("#sharedStateStatus");
    if (error.status === 409 && error.data?.state) {
      sharedStateVersion = Number(error.data.version) || sharedStateVersion;
      schedule = normalizeSchedule(error.data.state.schedule);
      calendarMeals = normalizeCalendar(error.data.state.calendarMeals);
      weekStartKey = error.data.state.weekStart || weekStartKey;
      favorites = Array.isArray(error.data.state.favorites) ? error.data.state.favorites : favorites;
      tasks = Array.isArray(error.data.state.tasks) ? error.data.state.tasks : tasks;
      recipeEdits = error.data.state.recipeEdits && typeof error.data.state.recipeEdits === "object" ? error.data.state.recipeEdits : recipeEdits;
      deletedRecipeIds = Array.isArray(error.data.state.deletedRecipeIds) ? error.data.state.deletedRecipeIds : deletedRecipeIds;
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
    schedule = normalizeSchedule(data.state.schedule);
    calendarMeals = normalizeCalendar(data.state.calendarMeals);
    weekStartKey = data.state.weekStart || currentWeekStartKey();
    favorites = Array.isArray(data.state.favorites) ? data.state.favorites : [];
    tasks = Array.isArray(data.state.tasks) ? data.state.tasks : [];
    recipeEdits = data.state.recipeEdits && typeof data.state.recipeEdits === "object" ? data.state.recipeEdits : {};
    deletedRecipeIds = Array.isArray(data.state.deletedRecipeIds) ? data.state.deletedRecipeIds : [];
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

function optionsForSlot(slot, selectedId = "") {
  const selectedRecipe = selectedId ? recipeById(selectedId) : null;
  const allowed = allRecipes().filter((recipe) => slot.categories.includes(categoryFor(recipe)) || recipe.id === selectedId);
  const recipesForOptions = selectedRecipe && !allowed.some((recipe) => recipe.id === selectedRecipe.id)
    ? [...allowed, selectedRecipe]
    : allowed;

  return recipesForOptions
    .map((recipe) => `<option value="${recipe.id}"${recipe.id === selectedId ? " selected" : ""}>${escapeHtml(localize(recipe.name))}</option>`)
    .join("");
}

function renderMealControls(meal, context, label) {
  const recipesForMeal = mealRecipes(meal);
  return `
    ${label ? `<strong>${escapeHtml(label)}</strong>` : ""}
    <div class="meal-picker">
      ${mealSlots.map((slot) => `
        <label>
          <span>${t(slot.label)}</span>
          <select data-meal-context="${context}" data-slot="${slot.key}">
            <option value="">${t(slot.choose)}</option>
            ${optionsForSlot(slot, meal[slot.key])}
          </select>
        </label>
      `).join("")}
      <label class="meal-notes">
        <span>${t("notesSlot")}</span>
        <textarea data-meal-context="${context}" data-slot="notes" rows="2">${escapeHtml(meal.notes || "")}</textarea>
      </label>
    </div>
    <p class="${mealHasWarning(meal) ? "has-warning" : ""}">${escapeHtml(mealSummary(meal))}</p>
    <div class="meal-open-buttons">
      ${recipesForMeal.map(({ recipe }) => `
        <button class="ghost-button" type="button" data-open="${recipe.id}">
          ${t("openDinner")}
        </button>
      `).join("")}
    </div>
  `;
}

function bindMealControls() {
  $$("[data-meal-context]").forEach((control) => {
    control.addEventListener("change", async () => {
      const [type, key] = control.dataset.mealContext.split(":");
      const slot = control.dataset.slot;
      const target = { ...calendarMealForDateKey(key) };
      target[slot] = control.value;

      if (type === "weekdate") {
        const weekDate = activeWeekDateKeys().find((item) => item.dateKey === key);
        if (!weekDate) return;
        schedule[weekDate.key] = target;
        delete calendarMeals[key];
      } else {
        calendarMeals[key] = target;
      }
      render();
      await saveSharedState();
    });
  });
}

function renderSchedule() {
  const grid = $("#scheduleGrid");
  const weekDates = activeWeekDateKeys();
  const todayKey = formatDateKey(new Date());
  const rangeFormatter = new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric" });
  $("#weekTitle").textContent = `${t("weekHeading")} · ${rangeFormatter.format(weekDates[0].date)}–${rangeFormatter.format(weekDates[6].date)}`;
  grid.innerHTML = weekDates
    .map((day) => {
      const meal = calendarMealForDateKey(day.dateKey);
      const label = `${day[lang]} · ${rangeFormatter.format(day.date)}${day.dateKey === todayKey ? ` · ${t("todayTab")}` : ""}`;
      return `
        <div class="day-card${day.dateKey === todayKey ? " today" : ""}">
          ${renderMealControls(meal, `weekdate:${day.dateKey}`, label)}
        </div>
      `;
    })
    .join("");
  bindMealControls();
}

function monthName(date) {
  return new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function calendarDateRange() {
  const start = new Date(visibleMonth);
  const startOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function renderCalendar() {
  const todayKey = formatDateKey(new Date());
  const activeDateKeys = new Set(activeWeekDateKeys().map((item) => item.dateKey));

  $("#monthTitle").textContent = monthName(visibleMonth);
  $("#calendarWeekdays").innerHTML = days.map((day) => `<span>${day[lang].slice(0, 3)}</span>`).join("");
  $("#calendarGrid").innerHTML = calendarDateRange()
    .map((date) => {
      const dateKey = formatDateKey(date);
      const hasOverride = Object.prototype.hasOwnProperty.call(calendarMeals, dateKey);
      const isThisWeek = activeDateKeys.has(dateKey);
      const meal = calendarMealForDateKey(dateKey);
      const classes = [
        "calendar-day",
        date.getMonth() === visibleMonth.getMonth() ? "" : "outside-month",
        dateKey === todayKey ? "today" : "",
      ].filter(Boolean).join(" ");

      return `
        <div class="${classes}${hasOverride ? " custom-date" : isThisWeek ? " weekly-date" : ""}">
          <div class="calendar-date">
            <span class="date-number">${date.getDate()}</span>
            ${hasOverride || isThisWeek ? `<span class="calendar-source">${t(hasOverride ? "customDate" : "weeklyPlan")}</span>` : ""}
          </div>
          ${renderMealControls(meal, `calendar:${dateKey}`, "")}
          ${hasOverride ? `<button class="calendar-inherit" type="button" data-use-weekly-plan="${dateKey}">${t("useWeeklyPlan")}</button>` : ""}
        </div>
      `;
    })
    .join("");
  bindMealControls();
  $$('[data-use-weekly-plan]').forEach((button) => {
    button.addEventListener("click", async () => {
      delete calendarMeals[button.dataset.useWeeklyPlan];
      render();
      await saveSharedState();
    });
  });
}

function renderRecipes() {
  const search = recipeSearch.trim().toLowerCase();
  const filtered = allRecipes().filter((recipe) => {
    const categoryMatch = categoryFilter === "all" || categoryFor(recipe) === categoryFilter;
    const haystack = [
      localize(recipe.name),
      localize(recipe.meta),
      localize(recipe.short),
      localize(recipe.tags),
      categoryLabel(categoryFor(recipe)),
    ].join(" ").toLowerCase();
    return categoryMatch && (!search || haystack.includes(search));
  });

  $("#recipeCount").textContent = `${filtered.length}/${allRecipes().length}`;
  $("#recipeList").innerHTML = filtered
    .map((recipe) => `
      <button class="recipe-card" type="button" data-open="${recipe.id}">
        <img src="${recipe.photos[0]}" alt="" />
        <span class="category-pill">${escapeHtml(categoryLabel(categoryFor(recipe)))}</span>
        ${favorites.includes(recipe.id) ? `<span class="favorite-pill" aria-label="${t("removeFavorite")}">★</span>` : ""}
        ${recipe.allergyWarning ? `<span class="warning-pill">${t("allergyBadge")}</span>` : ""}
        <h3>${escapeHtml(localize(recipe.name))}</h3>
        <p>${escapeHtml(localize(recipe.meta))}</p>
        <p>${escapeHtml(localize(recipe.short))}</p>
      </button>
    `)
    .join("");
  if (!filtered.length) {
    $("#recipeList").innerHTML = `<p class="empty-state">${lang === "en" ? "No matching recipes." : "No hay recetas que coincidan."}</p>`;
  }
}

function renderDetail() {
  const recipe = recipeById(selectedRecipeId);
  const warning = recipe.allergyWarning ? localize(recipe.allergyWarning) : "";
  $("#editRecipeForm").hidden = true;
  $("#detailName").textContent = localize(recipe.name);
  $("#detailMeta").textContent = localize(recipe.meta);
  $("#allergyWarning").hidden = !warning;
  $("#allergyWarning").textContent = warning;
  $("#ingredientList").innerHTML = (recipe.ingredients[lang] || recipe.ingredients.en).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  $("#stepList").innerHTML = (recipe.steps[lang] || recipe.steps.en).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  $("#familyNotes").textContent = localize(recipe.notes);
  $("#photoStrip").innerHTML = recipe.photos.map((src) => `<img src="${src}" alt="" />`).join("");
  const isFavorite = favorites.includes(recipe.id);
  $("#favoriteRecipe").textContent = t(isFavorite ? "removeFavorite" : "addFavorite");
  $("#favoriteRecipe").setAttribute("aria-pressed", `${isFavorite}`);
  $("#addRecipeGroceries").textContent = t("addRecipeToGroceries");
  setDetailStatus("");
}

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

function bindOpenButtons() {
  $$("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedRecipeId = button.dataset.open;
      renderDetail();
      $("#recipeDetail").hidden = false;
      $("#recipeDetail").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
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
  persistDrafts: () => {
    localStorage.setItem("dinner-drafts", JSON.stringify(drafts));
  },
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

$("#resetWeek").addEventListener("click", async () => {
  if (!window.confirm(t("clearWeekConfirm"))) return;
  schedule = normalizeSchedule(Object.fromEntries(days.map((day) => [day.key, { ...emptyMeal }])));
  activeWeekDateKeys().forEach(({ dateKey }) => delete calendarMeals[dateKey]);
  render();
  await saveSharedState();
});

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

$("#previousMonth").addEventListener("click", () => {
  visibleMonth.setMonth(visibleMonth.getMonth() - 1);
  render();
});

$("#todayMonth").addEventListener("click", () => {
  visibleMonth = new Date();
  visibleMonth.setDate(1);
  render();
});

$("#nextMonth").addEventListener("click", () => {
  visibleMonth.setMonth(visibleMonth.getMonth() + 1);
  render();
});

$("#markCooked").addEventListener("click", () => {
  $("#markCooked").textContent = lang === "en" ? "Cooked today" : "Hecha hoy";
});

$("#recipeSearch").addEventListener("input", (event) => {
  recipeSearch = event.target.value;
  renderRecipes();
  bindOpenButtons();
});

$("#categoryFilter").addEventListener("change", (event) => {
  categoryFilter = event.target.value;
  renderRecipes();
  bindOpenButtons();
});

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

  window.alert(t("installInstructions"));
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").then((registration) => {
    registration.update();
  });
}

render();
loadSharedState();
loadSharedRecipes();
loadGroceries();
loadInventory();
