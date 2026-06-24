export function createScheduleUi({
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
  getLang,
  getSchedule,
  setSchedule,
  getCalendarMeals,
  setCalendarMeals,
  getVisibleMonth,
  setVisibleMonth,
}) {
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
    $("#weekTitle").textContent = `${t("weekHeading")} · ${rangeFormatter.format(weekDates[0].date)}-${rangeFormatter.format(weekDates[6].date)}`;
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
        const nextCalendarMeals = { ...getCalendarMeals() };
        delete nextCalendarMeals[button.dataset.useWeeklyPlan];
        setCalendarMeals(nextCalendarMeals);
        render();
        await saveSharedState();
      });
    });
  }

  function bindScheduleControls() {
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
      render();
    });

    $("#todayMonth").addEventListener("click", () => {
      const nextMonth = new Date();
      nextMonth.setDate(1);
      setVisibleMonth(nextMonth);
      render();
    });

    $("#nextMonth").addEventListener("click", () => {
      const nextMonth = new Date(getVisibleMonth());
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      setVisibleMonth(nextMonth);
      render();
    });
  }

  return {
    bindScheduleControls,
    renderCalendar,
    renderSchedule,
  };
}
