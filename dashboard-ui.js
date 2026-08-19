import { localizedText, updateLocalizedText } from "./localized-data.js";
import { renderHandoffDetails } from "./handoff-ui.js";
import {
  addAvailableFood,
  availableFoodFreshness,
  availableFoodTypes,
  availableFoodUses,
  orderAvailableFood,
} from "./available-food.js";

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
  offerUndo,
  render,
  renderDetail,
  setView,
  getLang,
  getFavorites,
  getTasks,
  setTasks,
  getGroceries,
  getInventory,
  getAvailableFood = () => [],
  setAvailableFood = () => {},
  addAvailableFood: addAvailableFoodRecord = addAvailableFood,
  getCalendarMeals,
  setCalendarMeals,
  handoffOptions = [],
  getSelectedRecipeId,
  setSelectedRecipeId,
  openFocusedDinnerPlan = () => setView("schedule"),
  selectTodayStory = () => ({}),
  getRecipeMemory = () => ({}),
}) {
  function todayDateKey() {
    return formatDateKey(new Date());
  }

  function updateTodayMeal(nextMeal) {
    const dateKey = todayDateKey();
    setCalendarMeals({ ...getCalendarMeals(), [dateKey]: nextMeal });
    render();
    return saveSharedState();
  }

  function todaysMealPlan() {
    return calendarMealForDateKey(todayDateKey());
  }

  function memoryCopy(memory = {}) {
    memory = memory || {};
    const list = new Intl.ListFormat(getLang() === "es" ? "es" : "en", { style: "long", type: "conjunction" });
    if (memory.fact === "everyoneAte") return t("memoryEveryoneAte");
    if (memory.fact === "liked" && memory.likedNames?.length) {
      return t("memoryPeopleLiked").replace("{names}", list.format(memory.likedNames));
    }
    if (memory.fact === "skipped" && memory.skippedNames?.length) {
      return t("memoryPeopleSkipped").replace("{names}", list.format(memory.skippedNames));
    }
    if (memory.fact === "familyLoved") return t("memoryFamilyLoved");
    return "";
  }

  function memoryWhen(memory = {}) {
    memory = memory || {};
    if (!memory.lastMade) return "";
    const made = new Date(`${memory.lastMade}T12:00:00`);
    const today = new Date(`${todayDateKey()}T12:00:00`);
    const days = Math.max(0, Math.round((today.getTime() - made.getTime()) / 86400000));
    if (days === 0) return t("memoryMadeToday");
    if (days === 1) return t("memoryMadeYesterday");
    return t("memoryMadeDaysAgo").replace("{count}", `${days}`);
  }

  function availableFoodLabel(key, options) {
    return t(options.find((option) => option.key === key)?.label || "availableFoodUnknown");
  }

  function availableFoodUseText(item) {
    return item.useFor && item.useFor !== "any"
      ? ` · ${t("availableFoodUseLabel")}: ${escapeHtml(availableFoodLabel(item.useFor, availableFoodUses))}`
      : "";
  }

  function renderAvailableFood() {
    const firstElement = $("#todayUseFirst");
    const listElement = $("#todayAvailableFoodList");
    if (!firstElement || !listElement) return;

    const ordered = orderAvailableFood(getAvailableFood());
    const first = ordered[0];
    firstElement.innerHTML = first ? "" : `<p class="empty-state compact">${t("availableFoodEmpty")}</p>`;
    listElement.innerHTML = ordered.length
      ? ordered.map((item) => `
          <div class="available-food-row${item.id === first?.id ? " is-use-first" : ""}">
            <div>
              ${item.id === first?.id ? `<span class="available-food-priority">${t("availableFoodUseFirst")}</span>` : ""}
              <strong>${escapeHtml(localizedText(item.label, getLang()))}</strong>
              <span>${escapeHtml(availableFoodLabel(item.type, availableFoodTypes))} · ${escapeHtml(availableFoodLabel(item.freshness, availableFoodFreshness))}${availableFoodUseText(item)}</span>
            </div>
            <button class="text-action" type="button" data-remove-available-food="${escapeHtml(item.id)}">${t("availableFoodUsed")}</button>
          </div>
        `).join("")
      : "";
  }

  function renderToday() {
    const meal = todaysMealPlan();
    const recipesForMeal = mealRecipes(meal).map((item) => ({
      ...item,
      period: item.period || (item.key === "main" ? "dinner" : item.key),
      role: item.role || (["side", "salad"].includes(item.key) ? item.key : "main"),
    }));
    const dinnerItem = recipesForMeal.find(({ period, role }) => period === "dinner" && role === "main")
      || recipesForMeal.find(({ period }) => period === "dinner");
    const mainRecipe = dinnerItem?.recipe || null;
    const story = selectTodayStory({
      recipe: mainRecipe,
      meal,
      memory: mainRecipe ? getRecipeMemory(mainRecipe.id) : null,
      dateLabel: new Intl.DateTimeFormat(getLang() === "es" ? "es-US" : "en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date()),
    });
    const backdrop = $("#todayBackdrop");
    const todayImage = $("#todayImage");
    const backdropSrc = mainRecipe?.photos?.[0] || "";
    $("#todayBand").classList.toggle("empty", !mainRecipe);
    $("#todayBand").classList.toggle("has-photo", Boolean(backdropSrc));
    if (todayImage) todayImage.hidden = !backdropSrc;
    backdrop.hidden = !backdropSrc;
    if (backdropSrc) {
      backdrop.src = backdropSrc;
      backdrop.alt = localize(mainRecipe.name);
    }
    else backdrop.removeAttribute("src");
    $("#todayRecipeName").textContent = mainRecipe ? localize(mainRecipe.name) : t("nothingForTonight");
    $("#todayMeta").textContent = mainRecipe
      ? [story.servings ? t("tonightServes").replace("{count}", story.servings) : "", mealHasWarning(meal) ? t("allergyBadge") : ""].filter(Boolean).join(" · ")
      : t("nothingForTonightNote");
    const storyDate = $("#todayDate");
    if (storyDate) storyDate.textContent = story.dateLabel;
    const memory = $("#todayMemory");
    const memoryFact = memoryCopy(story.memory);
    const memoryDate = memoryWhen(story.memory);
    if (memory) {
      if ($("#todayMemoryFact")) $("#todayMemoryFact").textContent = memoryFact;
      if ($("#todayMemoryWhen")) $("#todayMemoryWhen").textContent = memoryDate;
      memory.hidden = !memoryFact && !memoryDate;
    }
    const dinnerCompanions = recipesForMeal
      .filter((item) => item.period === "dinner" && item.itemId !== dinnerItem?.itemId)
      .map(({ recipe }) => localize(recipe.name));
    const mealList = $("#todayMealList");
    mealList.textContent = dinnerCompanions.length
      ? `${t("servedWith")} ${dinnerCompanions.join(" · ")}`
      : "";
    mealList.hidden = !dinnerCompanions.length;

    const beforeText = localizedText(meal.notes, getLang()).trim();
    const before = $("#todayBefore");
    if ($("#todayBeforeText")) $("#todayBeforeText").textContent = beforeText;
    if (before) before.hidden = !beforeText;
    const after = $("#todayAfter");
    const afterText = story.extraServings > 0
      ? t("extraForTomorrow").replace("{count}", `${story.extraServings}`)
      : "";
    if ($("#todayAfterText")) $("#todayAfterText").textContent = afterText;
    if (after) after.hidden = !afterText;
    const handoffOptionsElement = $("#todayHandoffOptions");
    const handoffDetailsElement = $("#todayHandoffDetails");
    const handoffNote = $("#todayHandoffNote");
    if (handoffOptionsElement) {
      const handoff = meal.handoff || {};
      handoffOptionsElement.innerHTML = handoffOptions.map((option) => `
        <label class="handoff-option tone-${option.tone}">
          <input type="checkbox" data-today-handoff="${escapeHtml(option.key)}" ${handoff[option.key] ? "checked" : ""} />
          <span class="handoff-marker" aria-hidden="true"></span>
          <span>${escapeHtml(t(option.label))}</span>
        </label>
      `).join("");
    }
    if (handoffDetailsElement) {
      handoffDetailsElement.innerHTML = renderHandoffDetails({
        meal,
        context: "today",
        t,
        escapeHtml,
        localize,
        mealRecipes,
        inputAttributes: (field) => `data-today-handoff-detail="${escapeHtml(field)}"`,
        getLang,
      });
    }
    if (handoffNote && globalThis.document?.activeElement !== handoffNote) handoffNote.value = localizedText(meal.notes, getLang());
    const activeHandoff = handoffOptions.filter((option) => meal.handoff?.[option.key]);
    const handoffSummary = $("#todayHandoffSummary");
    if (handoffSummary) {
      handoffSummary.textContent = beforeText
        ? t("handoffSaved")
        : activeHandoff.length
          ? activeHandoff.map((option) => t(option.label)).join(" · ")
          : t("handoffAdd");
    }
    renderAvailableFood();
    const toBuy = getGroceries().filter((item) => !item.checked && !item.inInventory).length;
    $("#todayGrocerySummary").textContent = `${toBuy} ${t("itemsToBuy")}`;
    $("#todayInventorySummary").textContent = `${getInventory().filter((item) => item.stockState !== "out").length} ${t("itemsAtHome")}`;
    $("#cookToday").disabled = false;
    $("#cookToday").textContent = mainRecipe ? t("cookButton") : t("planDinner");
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
    return labels[assignee] ? t(labels[assignee]) : `${assignee || ""}`.trim() || t(labels.other);
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
        const removed = getTasks().find((task) => task.id === button.dataset.removeTask);
        setTasks(getTasks().filter((task) => task.id !== button.dataset.removeTask));
        renderTasks();
        await saveSharedState();
        if (removed) offerUndo?.(t("taskRemoved"), async () => {
          setTasks([removed, ...getTasks()]);
          renderTasks();
          await saveSharedState();
        });
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
      if (!mealRecipes(meal).some((item) => (item.period || (item.key === "main" ? "dinner" : item.key)) === "dinner")) return { dateKey, meal };
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
        setCalendarMeals({ ...getCalendarMeals(), [target.dateKey]: {
          ...target.meal,
          items: [...(target.meal.items || []), {
            id: `meal-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            period: "dinner",
            role: "main",
            sourceType: "recipe",
            recipeId: button.dataset.planFavorite,
          }],
        } });
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
      const items = mealRecipes(todaysMealPlan()).map((item) => ({
        ...item,
        period: item.period || (item.key === "main" ? "dinner" : item.key),
        role: item.role || (["side", "salad"].includes(item.key) ? item.key : "main"),
      }));
      const dinnerItem = items.find(({ period, role }) => period === "dinner" && role === "main")
        || items.find(({ period }) => period === "dinner")
        || items[0];
      if (!dinnerItem) {
        openFocusedDinnerPlan(todayDateKey());
        return;
      }
      setSelectedRecipeId(dinnerItem.recipe.id);
      setView("recipes");
      renderDetail();
      $("#recipeDetail").hidden = false;
      $("#recipeDetail").scrollIntoView({ behavior: "auto", block: "start" });
      $("#detailName").focus({ preventScroll: true });
    });

    $("#todayHandoffOptions")?.addEventListener("change", async (event) => {
      const checkbox = event.target.closest?.("[data-today-handoff]");
      if (!checkbox) return;
      const meal = todaysMealPlan();
      await updateTodayMeal({
        ...meal,
        handoff: {
          ...(meal.handoff || {}),
          [checkbox.dataset.todayHandoff]: checkbox.checked,
          ...(checkbox.dataset.todayHandoff === "leftovers" && !checkbox.checked
            ? { leftoverServings: "", leftoverUseFirst: "" }
            : {}),
          ...(checkbox.dataset.todayHandoff === "kidsSnack" && !checkbox.checked
            ? { snackStatus: "" }
            : {}),
        },
      });
    });

    $("#todayHandoffDetails")?.addEventListener("change", async (event) => {
      const control = event.target.closest?.("[data-today-handoff-detail]");
      if (!control) return;
      const meal = todaysMealPlan();
      await updateTodayMeal({
        ...meal,
        handoff: {
          ...(meal.handoff || {}),
          [control.dataset.todayHandoffDetail]: control.dataset.todayHandoffDetail === "snack"
            ? updateLocalizedText(meal.handoff?.snack, control.value.trim(), getLang())
            : control.value,
        },
      });
    });

    $("#todayHandoffNote")?.addEventListener("change", async (event) => {
      const meal = todaysMealPlan();
      await updateTodayMeal({
        ...meal,
        notes: updateLocalizedText(meal.notes, event.target.value.trim(), getLang()),
      });
    });

    $("#todayAvailableFoodForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const label = $("#todayAvailableFoodLabel").value.trim();
      const next = addAvailableFoodRecord(getAvailableFood(), {
        label,
        type: $("#todayAvailableFoodType").value,
        freshness: $("#todayAvailableFoodFreshness").value,
        useFor: $("#todayAvailableFoodUse").value,
        lang: getLang(),
      });
      if (!next) {
        $("#todayAvailableFoodStatus").textContent = t("availableFoodLabelRequired");
        return;
      }
      setAvailableFood(next);
      $("#todayAvailableFoodLabel").value = "";
      $("#todayAvailableFoodStatus").textContent = "";
      render();
      await saveSharedState();
    });

    $("#todayAvailableFoodList")?.addEventListener("click", async (event) => {
      const button = event.target.closest?.("[data-remove-available-food]");
      if (!button) return;
      setAvailableFood(getAvailableFood().filter((item) => item.id !== button.dataset.removeAvailableFood));
      render();
      await saveSharedState();
    });
  }

  return {
    bindDashboardControls,
    renderFavorites,
    renderAvailableFood,
    renderTasks,
    renderToday,
    todaysMealPlan,
  };
}
