import { localizedText, updateLocalizedText } from "./localized-data.js";
import { renderHandoffDetails } from "./handoff-ui.js";

export function createScheduleUi({
  $,
  $$,
  t,
  escapeHtml,
  localize,
  formatDateKey,
  normalizeMealPlan,
  mealPeriods = [],
  mealRoles = [
    { key: "main", label: "roleMain" },
    { key: "side", label: "roleSide" },
    { key: "salad", label: "roleSalad" },
    { key: "dessert", label: "roleDessert" },
    { key: "sauce", label: "roleSauce" },
    { key: "drink", label: "roleDrink" },
    { key: "other", label: "roleOther" },
  ],
  handoffOptions = [],
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
  servingsForRecipe = (recipe) => Number(recipe?.servings) || 0,
  plannedServings = (plan = {}) => (Number(plan.adults) || 2) + ((Number(plan.kids) || 2) * 0.5) + (Number(plan.guests) || 0),
  recipeBatchPlan = () => null,
  allRecipes,
  availableLeftoversForDate = () => [],
  copyCurrentWeekToNextWeek,
  saveSharedState,
  recordActivity = () => {},
  render,
  getLang,
  getSchedule,
  setSchedule,
  getCalendarMeals,
  setCalendarMeals,
  navigateWeek,
  goToCurrentWeek,
  getCurrentWeekStartKey,
  getVisibleMonth,
  setVisibleMonth,
}) {
  let selectedWeekDateKey = "";
  let selectedCalendarDateKey = "";
  let planningMode = "week";

  function renderPlanningMode() {
    const weekPanel = $("#weekPlanningPanel");
    const monthPanel = $("#monthPlanningPanel");
    const weekTab = $("#weekPlanningTab");
    const monthTab = $("#monthPlanningTab");
    if (!weekPanel || !monthPanel || !weekTab || !monthTab) return;
    const showingWeek = planningMode === "week";
    weekPanel.hidden = !showingWeek;
    monthPanel.hidden = showingWeek;
    weekTab.classList?.toggle("active", showingWeek);
    monthTab.classList?.toggle("active", !showingWeek);
    weekTab.setAttribute?.("aria-selected", `${showingWeek}`);
    monthTab.setAttribute?.("aria-selected", `${!showingWeek}`);
  }

  function matchingRecipes(query = "") {
    const normalizedQuery = `${query || ""}`.trim().toLocaleLowerCase(getLang() === "es" ? "es" : "en");
    if (!normalizedQuery) return allRecipes();
    return allRecipes().filter((recipe) => localize(recipe.name)
      .toLocaleLowerCase(getLang() === "es" ? "es" : "en")
      .includes(normalizedQuery));
  }

  function recipeOptions(query = "") {
    return matchingRecipes(query)
      .map((recipe) => `<option value="${escapeHtml(recipe.id)}">${escapeHtml(localize(recipe.name))}</option>`)
      .join("");
  }

  function roleOptions(selected = "main") {
    return mealRoles.map((role) => `<option value="${escapeHtml(role.key)}"${role.key === selected ? " selected" : ""}>${escapeHtml(t(role.label))}</option>`).join("");
  }

  function renderMealPeriod(period, meal, context) {
    const items = (meal.items || []).filter((item) => item.period === period.key);
    const dateKey = context.split(":")[1];
    const availableLeftovers = availableLeftoversForDate(dateKey);
    const servingPlan = meal.servingPlans?.[period.key] || meal.servingPlan;
    const neededServings = plannedServings(servingPlan);
    const controlId = `meal-${context}-${period.key}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    return `
      <section class="meal-builder-period" aria-labelledby="${controlId}-heading">
        <div class="meal-builder-period-heading">
          <h4 id="${controlId}-heading">${t(period.label)}</h4>
          <span>${t(items.length === 1 ? "mealItemCountOne" : "mealItemCountMany").replace("{count}", items.length)}</span>
        </div>
        <div class="meal-item-list">
          ${items.length ? items.map((item) => {
            const recipe = recipeById(item.recipeId);
            if (!recipe) return "";
            return `<article class="meal-item-row">
              <button class="meal-item-open" type="button" data-open="${escapeHtml(recipe.id)}">
                <strong>${escapeHtml(localize(recipe.name))}</strong>
                <span>${item.sourceType === "leftover"
                  ? escapeHtml(t("leftoverFromDate").replace("{date}", item.leftoverSourceDate))
                  : escapeHtml(t("openRecipe"))}</span>
              </button>
              <label>
                <span class="visually-hidden">${t("mealItemRole")}</span>
                <select data-meal-context="${escapeHtml(context)}" data-slot="item-role" data-item-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(t("mealItemRoleFor").replace("{recipe}", localize(recipe.name)))}">
                  ${roleOptions(item.role)}
                </select>
              </label>
              <button class="meal-item-remove" type="button" data-remove-meal-item="${escapeHtml(item.id)}" data-meal-context="${escapeHtml(context)}" aria-label="${escapeHtml(t("removeMealItem").replace("{recipe}", localize(recipe.name)))}">${t("remove")}</button>
            </article>`;
          }).join("") : `<p class="meal-period-empty">${t("mealPeriodEmpty")}</p>`}
        </div>
        <details class="meal-item-adder">
          <summary>${t("addToMeal").replace("{meal}", t(period.label))}</summary>
          <div class="meal-item-adder-fields">
            <label>
              <span>${t("findRecipe")}</span>
              <input id="${controlId}-search" type="search" inputmode="search" autocomplete="off" data-meal-item-search="${escapeHtml(context)}" data-period="${escapeHtml(period.key)}" placeholder="${escapeHtml(t("searchRecipes"))}" />
            </label>
            <label>
              <span>${t("recipeLabel")}</span>
              <select data-add-meal-recipe="${escapeHtml(context)}" data-period="${escapeHtml(period.key)}">
                <option value="">${t("chooseRecipe")}</option>
                ${recipeOptions()}
              </select>
            </label>
            <label>
              <span>${t("mealItemRole")}</span>
              <select data-add-meal-role="${escapeHtml(context)}" data-period="${escapeHtml(period.key)}">${roleOptions("main")}</select>
            </label>
            <button class="primary-action compact-button" type="button" data-add-meal-item="${escapeHtml(context)}" data-period="${escapeHtml(period.key)}" disabled>${t("addToMealButton")}</button>
            <small class="meal-search-empty" data-meal-item-empty="${escapeHtml(context)}" data-period="${escapeHtml(period.key)}" hidden>${t("noRecipeMatches")}</small>
          </div>
        </details>
        ${availableLeftovers.length ? `
          <details class="meal-item-adder leftover-item-adder">
            <summary>${t("useLeftoversInMeal").replace("{meal}", t(period.label))}</summary>
            <div class="meal-item-adder-fields leftover-adder-fields">
              <label>
                <span>${t("availableLeftovers")}</span>
                <select data-add-leftover-source="${escapeHtml(context)}" data-period="${escapeHtml(period.key)}">
                  <option value="">${t("chooseLeftovers")}</option>
                  ${availableLeftovers.map((leftover) => `<option value="${escapeHtml(`${leftover.sourceDate}::${leftover.itemId}`)}">${escapeHtml(t("leftoverChoice")
                    .replace("{recipe}", localize(leftover.recipe.name))
                    .replace("{date}", leftover.sourceDate)
                    .replace("{count}", leftover.availableServings))}</option>`).join("")}
                </select>
              </label>
              <label>
                <span>${t("servingsToUse")}</span>
                <input type="number" min="0.5" max="100" step="0.5" value="1" data-add-leftover-servings="${escapeHtml(context)}" data-period="${escapeHtml(period.key)}" />
              </label>
              <button class="primary-action compact-button" type="button" data-add-leftover-item="${escapeHtml(context)}" data-period="${escapeHtml(period.key)}" disabled>${t("addLeftoversButton")}</button>
            </div>
          </details>
        ` : ""}
        ${items.length ? `
          <details class="meal-serving-plan period-serving-plan">
            <summary>${escapeHtml(t("cookingForSummary")
              .replace("{adults}", servingPlan.adults)
              .replace("{kids}", servingPlan.kids)
              .replace("{guests}", servingPlan.guests)
              .replace("{servings}", neededServings))}</summary>
            <p class="meal-serving-helper">${t("periodServingPlanHelper").replace("{meal}", t(period.label))}</p>
            <div class="meal-diner-grid">
              ${["adults", "kids", "guests"].map((field) => `
                <label><span>${t(`${field}Count`)}</span><input type="number" min="0" max="20" step="1" value="${servingPlan[field]}" data-meal-context="${escapeHtml(context)}" data-slot="serving-plan" data-period="${escapeHtml(period.key)}" data-serving-field="${field}" /></label>
              `).join("")}
            </div>
            <div class="meal-yield-list">
              ${items.map((item) => {
                const recipe = recipeById(item.recipeId);
                if (!recipe) return "";
                const recipeYield = servingsForRecipe(recipe);
                const batch = recipeBatchPlan(recipeYield, neededServings);
                return `<div class="meal-yield-row">
                  <strong>${escapeHtml(localize(recipe.name))}</strong>
                  ${item.sourceType === "leftover"
                    ? `<span>${escapeHtml(t("leftoverServingPlan").replace("{count}", item.servings || 0))}</span>`
                    : batch ? `<span>${escapeHtml(t("yieldPlan")
                      .replace("{yield}", recipeYield)
                      .replace("{batches}", batch.batches)
                      .replace("{leftovers}", batch.expectedLeftovers))}</span>` : `<span class="meal-yield-missing">${t("yieldMissing")}</span>`}
                  ${item.sourceType !== "leftover" ? `<label><span>${t("actualLeftovers")}</span><input type="number" min="0" max="100" step="0.5" value="${meal.servingPlan.actualLeftovers?.[item.id] || 0}" data-meal-context="${escapeHtml(context)}" data-slot="actual-leftovers" data-item-id="${escapeHtml(item.id)}" /></label>` : ""}
                </div>`;
              }).join("")}
            </div>
          </details>
        ` : ""}
      </section>
    `;
  }

  function renderMealControls(meal, context, label) {
    const recipesForMeal = mealRecipes(meal);
    const hasOptionalContent = Boolean(localizedText(meal.notes, getLang()))
      || Object.values(meal.handoff || {}).some(Boolean);
    return `
      ${label ? `<strong>${escapeHtml(label)}</strong>` : ""}
      <div class="meal-picker">
        <div class="meal-builder">
          ${mealPeriods.map((period) => renderMealPeriod(period, meal, context)).join("")}
        </div>
        <p class="meal-period-helper">${t("flexibleMealBuilderNote")}</p>
        ${(recipesForMeal.length || hasOptionalContent) ? `
          <details class="meal-optional-fields"${hasOptionalContent ? " open" : ""}>
            <summary>${t("moreMealOptions")}</summary>
            <p class="meal-optional-helper">${t("moreMealOptionsNote")}</p>
            <div class="meal-optional-grid">
              <label class="meal-notes">
                <span>${t("notesSlot")}</span>
                <textarea data-meal-context="${context}" data-slot="notes" rows="2">${escapeHtml(localizedText(meal.notes, getLang()))}</textarea>
              </label>
              <fieldset class="meal-handoff-fieldset">
                <legend>${t("handoffLabel")}</legend>
                <p class="meal-handoff-helper">${t("handoffMealHelper")}</p>
                <div class="meal-handoff-options">
                  ${handoffOptions.map((option) => `
                    <label class="handoff-option tone-${option.tone}">
                      <input type="checkbox" data-meal-context="${context}" data-slot="handoff" data-handoff-key="${escapeHtml(option.key)}" ${meal.handoff?.[option.key] ? "checked" : ""} />
                      <span class="handoff-marker" aria-hidden="true"></span>
                      <span>${escapeHtml(t(option.label))}</span>
                    </label>
                  `).join("")}
                </div>
                ${renderHandoffDetails({
                  meal,
                  context,
                  t,
                  escapeHtml,
                  localize,
                  mealRecipes,
                  inputAttributes: (field) => `data-meal-context="${escapeHtml(context)}" data-slot="handoff-detail" data-handoff-field="${escapeHtml(field)}"`,
                  getLang,
                })}
              </fieldset>
            </div>
          </details>
        ` : ""}
      </div>
      <p class="${mealHasWarning(meal) ? "has-warning" : ""}">${escapeHtml(mealSummary(meal))}</p>
    `;
  }

  async function persistMealTarget(context, target) {
    const [type, key] = context.split(":");
    const normalizedTarget = normalizeMealPlan(target);
    const schedule = getSchedule();
    const calendarMeals = getCalendarMeals();
    if (type === "weekdate") {
      const weekDate = activeWeekDateKeys().find((item) => item.dateKey === key);
      if (!weekDate) return;
      setSchedule({ ...schedule, [weekDate.key]: normalizedTarget });
      const nextCalendarMeals = { ...calendarMeals };
      delete nextCalendarMeals[key];
      setCalendarMeals(nextCalendarMeals);
    } else {
      setCalendarMeals({ ...calendarMeals, [key]: normalizedTarget });
    }
    recordActivity("meal", t("activityMealUpdated").replace("{date}", key));
    render();
    const status = $(`[data-meal-save-status="${context}"]`);
    if (status) {
      status.textContent = t("mealChangeSaving");
      status.classList.add("pending");
    }
    const saved = await saveSharedState();
    const currentStatus = $(`[data-meal-save-status="${context}"]`);
    if (currentStatus) {
      currentStatus.textContent = t(saved === false ? "mealChangePending" : "mealChangeSaved");
      currentStatus.classList.toggle("pending", saved === false);
    }
  }

  function bindMealControls(contextType) {
    $$(`[data-meal-item-search^="${contextType}:"]`).forEach((search) => {
      search.addEventListener("input", () => {
        const context = search.dataset.mealItemSearch;
        const period = search.dataset.period;
        const select = $$(`[data-add-meal-recipe^="${contextType}:"]`).find((control) => (
          control.dataset.addMealRecipe === context && control.dataset.period === period
        ));
        if (!select) return;
        const matches = matchingRecipes(search.value);
        select.innerHTML = `<option value="">${t("chooseRecipe")}</option>${recipeOptions(search.value)}`;
        select.value = "";
        const addButton = $$(`[data-add-meal-item^="${contextType}:"]`).find((item) => (
          item.dataset.addMealItem === context && item.dataset.period === period
        ));
        if (addButton) addButton.disabled = true;
        const empty = $$(`[data-meal-item-empty^="${contextType}:"]`).find((item) => (
          item.dataset.mealItemEmpty === context && item.dataset.period === period
        ));
        if (empty) empty.hidden = matches.length > 0;
      });
    });

    $$(`[data-add-meal-recipe^="${contextType}:"]`).forEach((select) => {
      select.addEventListener("change", () => {
        const context = select.dataset.addMealRecipe;
        const period = select.dataset.period;
        const addButton = $$(`[data-add-meal-item^="${contextType}:"]`).find((item) => (
          item.dataset.addMealItem === context && item.dataset.period === period
        ));
        const role = $$(`[data-add-meal-role^="${contextType}:"]`).find((item) => (
          item.dataset.addMealRole === context && item.dataset.period === period
        ));
        const recipe = select.value ? recipeById(select.value) : null;
        if (recipe && role) {
          const category = categoryFor(recipe);
          role.value = mealRoles.some((item) => item.key === category) ? category : "other";
        }
        if (addButton) addButton.disabled = !select.value;
      });
    });

    $$(`[data-add-leftover-source^="${contextType}:"]`).forEach((select) => {
      select.addEventListener("change", () => {
        const context = select.dataset.addLeftoverSource;
        const period = select.dataset.period;
        const addButton = $$(`[data-add-leftover-item^="${contextType}:"]`).find((item) => (
          item.dataset.addLeftoverItem === context && item.dataset.period === period
        ));
        if (addButton) addButton.disabled = !select.value;
      });
    });

    $$(`[data-add-meal-item^="${contextType}:"]`).forEach((button) => {
      button.addEventListener("click", async () => {
        const context = button.dataset.addMealItem;
        const period = button.dataset.period;
        const recipeSelect = $$(`[data-add-meal-recipe^="${contextType}:"]`).find((item) => (
          item.dataset.addMealRecipe === context && item.dataset.period === period
        ));
        const roleSelect = $$(`[data-add-meal-role^="${contextType}:"]`).find((item) => (
          item.dataset.addMealRole === context && item.dataset.period === period
        ));
        if (!recipeSelect?.value) return;
        const key = context.split(":")[1];
        const target = normalizeMealPlan(calendarMealForDateKey(key));
        target.items = [...target.items, {
          id: `meal-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          period,
          role: roleSelect?.value || "other",
          sourceType: "recipe",
          recipeId: recipeSelect.value,
        }];
        await persistMealTarget(context, target);
      });
    });

    $$(`[data-add-leftover-item^="${contextType}:"]`).forEach((button) => {
      button.addEventListener("click", async () => {
        const context = button.dataset.addLeftoverItem;
        const period = button.dataset.period;
        const sourceSelect = $$(`[data-add-leftover-source^="${contextType}:"]`).find((item) => (
          item.dataset.addLeftoverSource === context && item.dataset.period === period
        ));
        const servingsInput = $$(`[data-add-leftover-servings^="${contextType}:"]`).find((item) => (
          item.dataset.addLeftoverServings === context && item.dataset.period === period
        ));
        const [leftoverSourceDate, leftoverSourceItemId] = `${sourceSelect?.value || ""}`.split("::");
        const leftover = availableLeftoversForDate(context.split(":")[1]).find((entry) => (
          entry.sourceDate === leftoverSourceDate && entry.itemId === leftoverSourceItemId
        ));
        if (!leftover) return;
        const requestedServings = Math.max(0.5, Math.min(leftover.availableServings, Number(servingsInput?.value) || 1));
        const key = context.split(":")[1];
        const target = normalizeMealPlan(calendarMealForDateKey(key));
        const category = categoryFor(leftover.recipe);
        target.items = [...target.items, {
          id: `meal-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          period,
          role: mealRoles.some((item) => item.key === category) ? category : "other",
          sourceType: "leftover",
          recipeId: leftover.recipe.id,
          leftoverSourceDate,
          leftoverSourceItemId,
          servings: requestedServings,
        }];
        await persistMealTarget(context, target);
      });
    });

    $$(`[data-remove-meal-item][data-meal-context^="${contextType}:"]`).forEach((button) => {
      button.addEventListener("click", async () => {
        const context = button.dataset.mealContext;
        const key = context.split(":")[1];
        const target = normalizeMealPlan(calendarMealForDateKey(key));
        target.items = target.items.filter((item) => item.id !== button.dataset.removeMealItem);
        await persistMealTarget(context, target);
      });
    });

    $$(`[data-meal-context^="${contextType}:"]`).forEach((control) => {
      control.addEventListener("change", async () => {
        const context = control.dataset.mealContext;
        const key = context.split(":")[1];
        const slot = control.dataset.slot;
        const target = normalizeMealPlan(calendarMealForDateKey(key));
        if (slot === "notes") {
          target.notes = updateLocalizedText(target.notes, control.value, getLang());
        } else if (slot === "handoff") {
          target.handoff = {
            ...(target.handoff || {}),
            [control.dataset.handoffKey]: control.checked,
            ...(control.dataset.handoffKey === "leftovers" && !control.checked
              ? { leftoverServings: "", leftoverUseFirst: "" }
              : {}),
            ...(control.dataset.handoffKey === "kidsSnack" && !control.checked
              ? { snackStatus: "" }
              : {}),
          };
        } else if (slot === "handoff-detail") {
          target.handoff = {
            ...(target.handoff || {}),
            [control.dataset.handoffField]: control.dataset.handoffField === "snack"
              ? updateLocalizedText(target.handoff?.snack, control.value.trim(), getLang())
              : control.value,
          };
        } else if (slot === "serving-plan") {
          const period = control.dataset.period || "dinner";
          const nextPeriodPlan = {
            ...(target.servingPlans?.[period] || target.servingPlan),
            [control.dataset.servingField]: Number(control.value),
          };
          target.servingPlans = { ...target.servingPlans, [period]: nextPeriodPlan };
          if (period === "dinner") {
            target.servingPlan = { ...target.servingPlan, ...nextPeriodPlan };
          }
        } else if (slot === "actual-leftovers") {
          target.servingPlan = {
            ...(target.servingPlan || {}),
            actualLeftovers: {
              ...(target.servingPlan?.actualLeftovers || {}),
              [control.dataset.itemId]: Number(control.value),
            },
          };
        } else if (slot === "item-role") {
          target.items = target.items.map((item) => item.id === control.dataset.itemId
            ? { ...item, role: control.value }
            : item);
        }
        await persistMealTarget(context, target);
      });
    });
  }

  function renderSchedule() {
    renderPlanningMode();
    const grid = $("#scheduleGrid");
    const weekDates = activeWeekDateKeys();
    const lang = getLang();
    const todayKey = formatDateKey(new Date());
    const rangeFormatter = new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric" });
    const activeDateKeys = new Set(weekDates.map((day) => day.dateKey));
    if (!activeDateKeys.has(selectedWeekDateKey)) {
      selectedWeekDateKey = activeDateKeys.has(todayKey) ? todayKey : weekDates[0].dateKey;
    }
    const currentWeek = getCurrentWeekStartKey();
    const weekLabel = weekDates[0].dateKey === currentWeek
      ? t("weekHeading")
      : weekDates[0].dateKey < currentWeek ? t("previousWeek") : t("nextWeek");
    $("#weekTitle").textContent = `${weekLabel} · ${rangeFormatter.format(weekDates[0].date)}-${rangeFormatter.format(weekDates[6].date)}`;
    grid.innerHTML = weekDates
      .map((day) => {
        const meal = calendarMealForDateKey(day.dateKey);
        const label = `${day[lang]} · ${rangeFormatter.format(day.date)}${day.dateKey === todayKey ? ` · ${t("todayTab")}` : ""}`;
        return `
          <button
            class="week-day-summary${day.dateKey === todayKey ? " today" : ""}${day.dateKey === selectedWeekDateKey ? " selected" : ""}"
            type="button"
            data-edit-week-date="${day.dateKey}"
            aria-pressed="${day.dateKey === selectedWeekDateKey}"
          >
            <span>${escapeHtml(label)}</span>
            <strong class="${mealHasWarning(meal) ? "has-warning" : ""}">${escapeHtml(mealSummary(meal))}</strong>
            <small>${t("editDay")}</small>
          </button>
        `;
      })
      .join("");

    const selectedDay = weekDates.find((day) => day.dateKey === selectedWeekDateKey);
    const editor = $("#weekDateEditor");
    const editorLabel = `${selectedDay[lang]} · ${rangeFormatter.format(selectedDay.date)}`;
    editor.innerHTML = `
      <div class="schedule-editor-heading">
        <span>${t("editDay")}</span>
        <h3 id="weekEditorHeading" tabindex="-1">${escapeHtml(editorLabel)}</h3>
      </div>
      <p class="meal-save-status" role="status" data-meal-save-status="weekdate:${selectedWeekDateKey}"></p>
      ${renderMealControls(calendarMealForDateKey(selectedWeekDateKey), `weekdate:${selectedWeekDateKey}`, "")}
    `;

    bindMealControls("weekdate");
    $$("[data-edit-week-date]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedWeekDateKey = button.dataset.editWeekDate;
        renderSchedule();
        $("#weekDateEditor").scrollIntoView({ behavior: "smooth", block: "start" });
        $("#weekEditorHeading").focus({ preventScroll: true });
      });
    });
  }

  function monthName(date) {
    return new Intl.DateTimeFormat(getLang() === "es" ? "es-US" : "en-US", {
      month: "long",
      year: "numeric",
    }).format(date);
  }

  function calendarDateRange() {
    const start = new Date(getVisibleMonth());
    const startOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - startOffset);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }

  function renderCalendar() {
    const lang = getLang();
    const visibleMonth = getVisibleMonth();
    const todayKey = formatDateKey(new Date());
    const activeDateKeys = new Set(activeWeekDateKeys().map((item) => item.dateKey));
    const calendarMeals = getCalendarMeals();
    const dateFormatter = new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    $("#monthTitle").textContent = monthName(visibleMonth);
    $("#calendarWeekdays").innerHTML = days.map((day) => `<span>${day[lang].slice(0, 3)}</span>`).join("");
    $("#calendarGrid").innerHTML = calendarDateRange()
      .map((date) => {
        const dateKey = formatDateKey(date);
        const hasOverride = Object.prototype.hasOwnProperty.call(calendarMeals, dateKey);
        const isThisWeek = activeDateKeys.has(dateKey);
        const meal = calendarMealForDateKey(dateKey);
        const summary = mealSummary(meal);
        const classes = [
          "calendar-day",
          date.getMonth() === visibleMonth.getMonth() ? "" : "outside-month",
          dateKey === todayKey ? "today" : "",
          dateKey === selectedCalendarDateKey ? "selected" : "",
          mealHasContent(meal) ? "has-meal" : "",
        ].filter(Boolean).join(" ");

        return `
          <button
            class="${classes}${hasOverride ? " custom-date" : isThisWeek ? " weekly-date" : ""}"
            type="button"
            data-edit-calendar-date="${dateKey}"
            aria-pressed="${dateKey === selectedCalendarDateKey}"
            aria-label="${escapeHtml(`${dateFormatter.format(date)}: ${summary}`)}"
          >
            <div class="calendar-date">
              <span class="date-number">${date.getDate()}</span>
              ${hasOverride || isThisWeek ? `<span class="calendar-source">${t(hasOverride ? "customDate" : "weeklyPlan")}</span>` : ""}
            </div>
            <span class="calendar-meal-summary">${escapeHtml(summary)}</span>
          </button>
        `;
      })
      .join("");

    const agenda = $("#calendarAgenda");
    if (agenda) {
      const plannedDates = calendarDateRange().filter((date) => (
        date.getMonth() === visibleMonth.getMonth()
        && mealHasContent(calendarMealForDateKey(formatDateKey(date)))
      ));
      agenda.innerHTML = `
        <p class="calendar-agenda-label">${t("calendarAgendaLabel")}</p>
        ${plannedDates.length
          ? plannedDates.map((date) => {
            const dateKey = formatDateKey(date);
            return `<button class="calendar-agenda-item" type="button" data-edit-calendar-date="${dateKey}">
              <span>${escapeHtml(dateFormatter.format(date))}</span>
              <strong>${escapeHtml(mealSummary(calendarMealForDateKey(dateKey)))}</strong>
            </button>`;
          }).join("")
          : `<p class="calendar-agenda-empty">${t("calendarAgendaEmpty")}</p>`}
      `;
    }

    const editor = $("#calendarDateEditor");
    if (!selectedCalendarDateKey) {
      editor.hidden = true;
      editor.innerHTML = "";
    } else {
      const selectedDate = new Date(`${selectedCalendarDateKey}T12:00:00`);
      const selectedMeal = calendarMealForDateKey(selectedCalendarDateKey);
      const hasOverride = Object.prototype.hasOwnProperty.call(calendarMeals, selectedCalendarDateKey);
      editor.hidden = false;
      editor.innerHTML = `
        <div class="schedule-editor-heading">
          <span>${t("editDate")}</span>
          <h3 id="calendarEditorHeading" tabindex="-1">${escapeHtml(dateFormatter.format(selectedDate))}</h3>
        </div>
        <p class="meal-save-status" role="status" data-meal-save-status="calendar:${selectedCalendarDateKey}"></p>
        ${renderMealControls(selectedMeal, `calendar:${selectedCalendarDateKey}`, "")}
        ${hasOverride ? `<button class="text-action calendar-inherit" type="button" data-use-weekly-plan="${selectedCalendarDateKey}">${t("useWeeklyPlan")}</button>` : ""}
      `;
      bindMealControls("calendar");
    }

    $$("[data-edit-calendar-date]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedCalendarDateKey = button.dataset.editCalendarDate;
        const selectedDate = new Date(`${selectedCalendarDateKey}T12:00:00`);
        const visibleMonth = getVisibleMonth();
        if (selectedDate.getMonth() !== visibleMonth.getMonth() || selectedDate.getFullYear() !== visibleMonth.getFullYear()) {
          selectedDate.setDate(1);
          setVisibleMonth(selectedDate);
        }
        renderCalendar();
        $("#calendarDateEditor").scrollIntoView({ behavior: "smooth", block: "start" });
        $("#calendarEditorHeading").focus({ preventScroll: true });
      });
    });
    $$('[data-use-weekly-plan]').forEach((button) => {
      button.addEventListener("click", async () => {
        const nextCalendarMeals = { ...getCalendarMeals() };
        delete nextCalendarMeals[button.dataset.useWeeklyPlan];
        setCalendarMeals(nextCalendarMeals);
        render();
        await saveSharedState();
      });
    });
  }

  function bindScheduleControls() {
    $$("[data-planning-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        planningMode = button.dataset.planningMode === "month" ? "month" : "week";
        renderPlanningMode();
        $(planningMode === "month" ? "#monthTitle" : "#weekTitle")?.focus?.({ preventScroll: true });
      });
    });

    $("#previousWeek").addEventListener("click", async () => {
      await navigateWeek(-1);
    });

    $("#thisWeek").addEventListener("click", async () => {
      await goToCurrentWeek();
    });

    $("#nextWeek").addEventListener("click", async () => {
      await navigateWeek(1);
    });

    const scheduleStatus = $("#scheduleStatus");
    const setScheduleStatus = (message = "", isError = false) => {
      if (!scheduleStatus) return;
      scheduleStatus.textContent = message;
      scheduleStatus.classList.toggle("error", isError);
    };

    $("#copyWeekForward").addEventListener("click", async () => {
      const result = copyCurrentWeekToNextWeek();
      if (!result.copiedCount) {
        setScheduleStatus(
          result.skippedCount ? t("weekCopyAlreadyPlanned") : t("weekCopyNothingPlanned")
        );
        return;
      }

      render();
      setScheduleStatus(
        t(result.skippedCount ? "weekCopiedToNextWithSkips" : "weekCopiedToNext")
          .replace("{count}", result.copiedCount)
      );
      await saveSharedState();
    });

    $("#resetWeek").addEventListener("click", async () => {
      if (!window.confirm(t("clearWeekConfirm"))) return;
      setSchedule(Object.fromEntries(days.map((day) => [day.key, { ...emptyMeal }])));
      const nextCalendarMeals = { ...getCalendarMeals() };
      activeWeekDateKeys().forEach(({ dateKey }) => delete nextCalendarMeals[dateKey]);
      setCalendarMeals(nextCalendarMeals);
      render();
      setScheduleStatus("");
      await saveSharedState();
    });

    $("#previousMonth").addEventListener("click", () => {
      const nextMonth = new Date(getVisibleMonth());
      nextMonth.setMonth(nextMonth.getMonth() - 1);
      setVisibleMonth(nextMonth);
      selectedCalendarDateKey = "";
      render();
    });

    $("#todayMonth").addEventListener("click", () => {
      const nextMonth = new Date();
      nextMonth.setDate(1);
      setVisibleMonth(nextMonth);
      selectedCalendarDateKey = "";
      render();
    });

    $("#nextMonth").addEventListener("click", () => {
      const nextMonth = new Date(getVisibleMonth());
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      setVisibleMonth(nextMonth);
      selectedCalendarDateKey = "";
      render();
    });
  }

  return {
    bindScheduleControls,
    renderCalendar,
    renderSchedule,
  };
}
