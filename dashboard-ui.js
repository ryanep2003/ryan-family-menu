import { localizedText, updateLocalizedText } from "./localized-data.js";

export function createDashboardUi({
  $,
  $$,
  t,
  escapeHtml,
  localize,
  formatDateKey,
  categoryFor,
  categoryLabel,
  mealRecipes,
  mealHasWarning,
  calendarMealForDateKey,
  recipeById,
  allRecipes,
  saveSharedState,
  render,
  renderDetail,
  setView,
  getLang,
  getFavorites,
  getTasks,
  setTasks,
  getGroceries,
  getInventory,
  getCalendarMeals,
  setCalendarMeals,
  getSelectedRecipeId,
  setSelectedRecipeId,
}) {
  function todaysMealPlan() {
    return calendarMealForDateKey(formatDateKey(new Date()));
  }

  function renderToday() {
    const meal = todaysMealPlan();
    const mainRecipe = meal.main ? recipeById(meal.main) : null;
    const recipesForMeal = mealRecipes(meal);
    $("#todayRecipeName").textContent = mainRecipe ? localize(mainRecipe.name) : t("noMealSet");
    $("#todayMeta").textContent = recipesForMeal.length
      ? `${t(recipesForMeal.length === 1 ? "plannedRecipeOne" : "plannedRecipeMany").replace("{count}", recipesForMeal.length)}${mealHasWarning(meal) ? ` · ${t("allergyBadge")}` : ""}`
      : t("noMealSet");
    $("#todayMealList").innerHTML = recipesForMeal
      .map(({ key, recipe }) => `
        <button type="button" data-open="${escapeHtml(recipe.id)}">
          <span>${t(`${key}Slot`)}</span>
          <strong>${escapeHtml(localize(recipe.name))}</strong>
          ${recipe.allergyWarning ? `<em>${t("allergyBadge")}</em>` : ""}
        </button>
      `)
      .join("");
    const toBuy = getGroceries().filter((item) => !item.checked && !item.inInventory).length;
    $("#todayGrocerySummary").textContent = `${toBuy} ${t("itemsToBuy")}`;
    $("#todayInventorySummary").textContent = `${getInventory().filter((item) => item.stockState !== "out").length} ${t("itemsAtHome")}`;
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
    return getTasks().filter((task) => task.date === todayKey);
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
                <strong>${escapeHtml(localizedText(task.text, getLang()))}</strong>
                <small>${escapeHtml(taskAssigneeLabel(task.assignee))}</small>
              </span>
            </label>
            <button class="icon-remove" type="button" data-remove-task="${escapeHtml(task.id)}" aria-label="${t("remove")}">&times;</button>
          </div>
        `).join("")
      : `<p class="empty-state compact">${t("tasksEmpty")}</p>`;

    $$('[data-task-id]').forEach((checkbox) => {
      checkbox.addEventListener("change", async () => {
        const nextTasks = getTasks().map((task) =>
          task.id === checkbox.dataset.taskId ? { ...task, completed: checkbox.checked } : task
        );
        setTasks(nextTasks);
        renderTasks();
        await saveSharedState();
      });
    });

    $$('[data-remove-task]').forEach((button) => {
      button.addEventListener("click", async () => {
        setTasks(getTasks().filter((task) => task.id !== button.dataset.removeTask));
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
    const favoriteRecipes = getFavorites()
      .map((id) => allRecipes().find((recipe) => recipe.id === id))
      .filter(Boolean);
    $("#favoriteList").innerHTML = favoriteRecipes.length
      ? favoriteRecipes.map((recipe) => `
          <div class="favorite-item">
            <button class="favorite-open" type="button" data-open="${escapeHtml(recipe.id)}">
              <img src="${escapeHtml(recipe.photos[0])}" alt="${escapeHtml(localize(recipe.name))}" loading="lazy" decoding="async" />
              <span>
                <strong>${escapeHtml(localize(recipe.name))}</strong>
                <small>${escapeHtml(categoryLabel(categoryFor(recipe)))}</small>
              </span>
            </button>
            <button class="ghost-button compact-button" type="button" data-plan-favorite="${escapeHtml(recipe.id)}">${t("planNextOpen")}</button>
          </div>
        `).join("")
      : `<p class="empty-state compact">${t("favoritesEmpty")}</p>`;

    $$('[data-plan-favorite]').forEach((button) => {
      button.addEventListener("click", async () => {
        const target = nextOpenMealDate();
        setCalendarMeals({ ...getCalendarMeals(), [target.dateKey]: { ...target.meal, main: button.dataset.planFavorite } });
        render();
        await saveSharedState();
      });
    });
  }

  function bindDashboardControls() {
    $("#taskForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = $("#taskInput").value.trim();
      if (!text) return;

      setTasks([{
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: updateLocalizedText("", text, getLang()),
        assignee: $("#taskAssigneeInput").value,
        date: formatDateKey(new Date()),
        completed: false,
        createdAt: new Date().toISOString(),
      }, ...getTasks()]);
      $("#taskInput").value = "";
      renderTasks();
      await saveSharedState();
    });

    $("#cookToday").addEventListener("click", () => {
      const mainRecipe = todaysMealPlan().main;
      if (!mainRecipe) return;
      setSelectedRecipeId(mainRecipe);
      setView("recipes");
      renderDetail();
      $("#recipeDetail").hidden = false;
      $("#recipeDetail").scrollIntoView({ behavior: "auto", block: "start" });
      $("#detailName").focus({ preventScroll: true });
    });
  }

  return {
    bindDashboardControls,
    renderFavorites,
    renderTasks,
    renderToday,
    todaysMealPlan,
  };
}
