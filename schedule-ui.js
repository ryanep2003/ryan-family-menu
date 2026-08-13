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
  mealSlots,
  mealPeriods = [],
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
  copyCurrentWeekToNextWeek,
  saveSharedState,
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

  function recipesForSlot(slot, selectedId = "", query = "") {
    const selectedRecipe = selectedId ? recipeById(selectedId) : null;
    const allowed = allRecipes().filter((recipe) => slot.categories.includes(categoryFor(recipe)) || recipe.id === selectedId);
    const recipesForOptions = selectedRecipe && !allowed.some((recipe) => recipe.id === selectedRecipe.id)
      ? [...allowed, selectedRecipe]
      : allowed;
    const normalizedQuery = `${query || ""}`.trim().toLocaleLowerCase(getLang() === "es" ? "es" : "en");

    if (!normalizedQuery) return recipesForOptions;
    return recipesForOptions.filter((recipe) => localize(recipe.name).toLocaleLowerCase(getLang() === "es" ? "es" : "en").includes(normalizedQuery));
  }

  function optionsForSlot(slot, selectedId = "", query = "") {
    return recipesForSlot(slot, selectedId, query)
      .map((recipe) => `<option value="${escapeHtml(recipe.id)}"${recipe.id === selectedId ? " selected" : ""}>${escapeHtml(localize(recipe.name))}</option>`)
      .join("");
  }

  function renderRecipePicker(slot, meal, context, className = "") {
    const pickerId = `meal-${context}-${slot.key}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    const helperId = `meal-${context}-helper`.replace(/[^a-zA-Z0-9_-]/g, "-");
    return `
      <div class="meal-recipe-picker${className ? ` ${className}` : ""}">
        <label for="${pickerId}-search">${t(slot.label)}</label>
        <input
          id="${pickerId}-search"
          type="search"
          inputmode="search"
          autocomplete="off"
          data-meal-search="${escapeHtml(context)}"
          data-search-slot="${escapeHtml(slot.key)}"
          placeholder="${escapeHtml(t("searchRecipes"))}"
          aria-describedby="${helperId}"
        />
        <select id="${pickerId}-select" data-meal-context="${escapeHtml(context)}" data-slot="${escapeHtml(slot.key)}" aria-label="${escapeHtml(t(slot.label))}">
          <option value="">${t(slot.choose)}</option>
          ${optionsForSlot(slot, meal[slot.key])}
        </select>
        <small class="meal-search-empty" data-meal-search-empty="${escapeHtml(context)}" data-search-slot="${escapeHtml(slot.key)}" hidden>${t("noRecipeMatches")}</small>
      </div>
    `;
  }

  function renderMealControls(meal, context, label) {
    const recipesForMeal = mealRecipes(meal);
    const neededServings = plannedServings(meal.servingPlan);
    const mainSlot = mealSlots.find((slot) => slot.key === "main") || mealSlots[0];
    const primarySlots = mealPeriods.length ? mealPeriods : [mainSlot];
    const primaryKeys = new Set(primarySlots.map((slot) => slot.key));
    const optionalSlots = mealSlots.filter((slot) => !primaryKeys.has(slot.key) && slot.key !== "main");
    const hasOptionalContent = optionalSlots.some((slot) => meal[slot.key])
      || Boolean(localizedText(meal.notes, getLang()))
      || Object.values(meal.handoff || {}).some(Boolean);
    const openLabelBySlot = {
      breakfast: "openBreakfast",
      lunch: "openLunch",
      lunchSalad: "openLunchSalad",
      dinner: "openDinner",
      main: "openMain",
      side: "openSide",
      salad: "openSalad",
    };
    return `
      ${label ? `<strong>${escapeHtml(label)}</strong>` : ""}
      <div class="meal-picker">
        <div class="meal-period-grid">
          ${primarySlots.map((slot) => renderRecipePicker(slot, meal, context, "meal-primary-choice")).join("")}
        </div>
        <p class="meal-period-helper" id="${`meal-${context}-helper`.replace(/[^a-zA-Z0-9_-]/g, "-")}">${t("mealPeriodsNote")}</p>
        ${recipesForMeal.length ? `
          <details class="meal-serving-plan">
            <summary>${escapeHtml(t("cookingForSummary")
              .replace("{adults}", meal.servingPlan.adults)
              .replace("{kids}", meal.servingPlan.kids)
              .replace("{guests}", meal.servingPlan.guests)
              .replace("{servings}", neededServings))}</summary>
            <p class="meal-serving-helper">${t("servingPlanHelper")}</p>
            <div class="meal-diner-grid">
              ${["adults", "kids", "guests"].map((field) => `
                <label><span>${t(`${field}Count`)}</span><input type="number" min="0" max="20" step="1" value="${meal.servingPlan[field]}" data-meal-context="${escapeHtml(context)}" data-slot="serving-plan" data-serving-field="${field}" /></label>
              `).join("")}
            </div>
            <div class="meal-yield-list">
              ${recipesForMeal.map(({ recipe }) => {
                const recipeYield = servingsForRecipe(recipe);
                const batch = recipeBatchPlan(recipeYield, neededServings);
                return `<div class="meal-yield-row">
                  <strong>${escapeHtml(localize(recipe.name))}</strong>
                  ${batch ? `<span>${escapeHtml(t("yieldPlan")
                    .replace("{yield}", recipeYield)
                    .replace("{batches}", batch.batches)
                    .replace("{leftovers}", batch.expectedLeftovers))}</span>` : `<span class="meal-yield-missing">${t("yieldMissing")}</span>`}
                  <label><span>${t("actualLeftovers")}</span><input type="number" min="0" max="100" step="0.5" value="${meal.servingPlan.actualLeftovers?.[recipe.id] || 0}" data-meal-context="${escapeHtml(context)}" data-slot="actual-leftovers" data-recipe-id="${escapeHtml(recipe.id)}" /></label>
                </div>`;
              }).join("")}
            </div>
          </details>
        ` : ""}
        ${(primarySlots.some((slot) => meal[slot.key]) || hasOptionalContent) ? `
          <details class="meal-optional-fields"${hasOptionalContent ? " open" : ""}>
            <summary>${t("moreMealOptions")}</summary>
            <p class="meal-optional-helper">${t("moreMealOptionsNote")}</p>
            <div class="meal-optional-grid">
              ${optionalSlots.map((slot) => renderRecipePicker(slot, meal, context)).join("")}
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
      <div class="meal-open-buttons">
        ${recipesForMeal.map(({ key, recipe }) => `
          <button class="ghost-button" type="button" data-open="${escapeHtml(recipe.id)}">
            ${t(openLabelBySlot[key] || "openDinner")}: ${escapeHtml(localize(recipe.name))}
          </button>
        `).join("")}
      </div>
    `;
  }

  function bindMealControls(contextType) {
    $$(`[data-meal-search^="${contextType}:"]`).forEach((search) => {
      search.addEventListener("input", () => {
        const context = search.dataset.mealSearch;
        const slotKey = search.dataset.searchSlot;
        const slot = mealSlots.find((item) => item.key === slotKey);
        const select = $$(`[data-meal-context^="${contextType}:"]`).find((control) => (
          control.dataset.mealContext === context && control.dataset.slot === slotKey
        ));
        if (!slot || !select) return;

        const selectedId = select.value;
        const matches = recipesForSlot(slot, selectedId, search.value);
        select.innerHTML = `<option value="">${t(slot.choose)}</option>${optionsForSlot(slot, selectedId, search.value)}`;
        select.value = matches.some((recipe) => recipe.id === selectedId) ? selectedId : "";
        const empty = $$(`[data-meal-search-empty^="${contextType}:"]`).find((item) => (
          item.dataset.mealSearchEmpty === context && item.dataset.searchSlot === slotKey
        ));
        if (empty) empty.hidden = matches.length > 0;
      });
    });

    $$(`[data-meal-context^="${contextType}:"]`).forEach((control) => {
      control.addEventListener("change", async () => {
        const [type, key] = control.dataset.mealContext.split(":");
        const slot = control.dataset.slot;
        const target = { ...calendarMealForDateKey(key) };
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
          target.servingPlan = {
            ...(target.servingPlan || {}),
            [control.dataset.servingField]: Number(control.value),
          };
        } else if (slot === "actual-leftovers") {
          target.servingPlan = {
            ...(target.servingPlan || {}),
            actualLeftovers: {
              ...(target.servingPlan?.actualLeftovers || {}),
              [control.dataset.recipeId]: Number(control.value),
            },
          };
        } else {
          target[slot] = control.value;
        }

        const schedule = getSchedule();
        const calendarMeals = getCalendarMeals();
        if (type === "weekdate") {
          const weekDate = activeWeekDateKeys().find((item) => item.dateKey === key);
          if (!weekDate) return;
          setSchedule({ ...schedule, [weekDate.key]: target });
          const nextCalendarMeals = { ...calendarMeals };
          delete nextCalendarMeals[key];
          setCalendarMeals(nextCalendarMeals);
        } else {
          setCalendarMeals({ ...calendarMeals, [key]: target });
        }
        render();
        await saveSharedState();
      });
    });
  }

  function renderSchedule() {
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
          <h3>${escapeHtml(dateFormatter.format(selectedDate))}</h3>
        </div>
        ${renderMealControls(selectedMeal, `calendar:${selectedCalendarDateKey}`, "")}
        ${hasOverride ? `<button class="text-action calendar-inherit" type="button" data-use-weekly-plan="${selectedCalendarDateKey}">${t("useWeeklyPlan")}</button>` : ""}
      `;
      bindMealControls("calendar");
    }

    $$("[data-edit-calendar-date]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedCalendarDateKey = button.dataset.editCalendarDate;
        renderCalendar();
        $("#calendarDateEditor").scrollIntoView({ behavior: "smooth", block: "start" });
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
