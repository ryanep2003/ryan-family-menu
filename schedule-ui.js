import { localizedText, updateLocalizedText } from "./localized-data.js";

export function createScheduleUi({
  $,
  $$,
  t,
  escapeHtml,
  localize,
  formatDateKey,
  normalizeMealPlan,
  mealSlots,
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
  allRecipes,
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

  function optionsForSlot(slot, selectedId = "") {
    const selectedRecipe = selectedId ? recipeById(selectedId) : null;
    const allowed = allRecipes().filter((recipe) => slot.categories.includes(categoryFor(recipe)) || recipe.id === selectedId);
    const recipesForOptions = selectedRecipe && !allowed.some((recipe) => recipe.id === selectedRecipe.id)
      ? [...allowed, selectedRecipe]
      : allowed;

    return recipesForOptions
      .map((recipe) => `<option value="${escapeHtml(recipe.id)}"${recipe.id === selectedId ? " selected" : ""}>${escapeHtml(localize(recipe.name))}</option>`)
      .join("");
  }

  function renderMealControls(meal, context, label) {
    const recipesForMeal = mealRecipes(meal);
    const openLabelBySlot = {
      main: "openMain",
      side: "openSide",
      salad: "openSalad",
    };
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
          <textarea data-meal-context="${context}" data-slot="notes" rows="2">${escapeHtml(localizedText(meal.notes, getLang()))}</textarea>
        </label>
        <fieldset class="meal-handoff-fieldset">
          <legend>${t("handoffLabel")}</legend>
          <div class="meal-handoff-options">
            ${handoffOptions.map((option) => `
              <label class="handoff-option tone-${option.tone}">
                <input type="checkbox" data-meal-context="${context}" data-slot="handoff" data-handoff-key="${escapeHtml(option.key)}" ${meal.handoff?.[option.key] ? "checked" : ""} />
                <span class="handoff-marker" aria-hidden="true"></span>
                <span>${escapeHtml(t(option.label))}</span>
              </label>
            `).join("")}
          </div>
        </fieldset>
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

    $("#resetWeek").addEventListener("click", async () => {
      if (!window.confirm(t("clearWeekConfirm"))) return;
      setSchedule(Object.fromEntries(days.map((day) => [day.key, { ...emptyMeal }])));
      const nextCalendarMeals = { ...getCalendarMeals() };
      activeWeekDateKeys().forEach(({ dateKey }) => delete nextCalendarMeals[dateKey]);
      setCalendarMeals(nextCalendarMeals);
      render();
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
