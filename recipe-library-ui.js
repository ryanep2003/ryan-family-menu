import { allLocalizedText, hasLocalizedContent, isMeaningfulText, localizedTextExact } from "./localized-data.js";
import { linesMatchLanguage, textMatchesLanguage } from "./language-quality.js";
import { libraryStripRecipes, recipeBrowsePhotoMarkup } from "./recipe-browse.js";
import { isUsableRecipeLine, servingsForRecipe } from "./recipe-utils.js";
import { appendRecipeToMeal, mealRoles, upcomingMealDateOptions } from "./schedule-utils.js";

export { LIBRARY_STRIP_LIMIT, libraryStripRecipes } from "./recipe-browse.js";

export function createRecipeLibraryUi({
  $,
  $$,
  t,
  escapeHtml,
  localize,
  localizeExact,
  categoryFor,
  categoryLabel,
  getLang,
  getFavorites,
  allRecipes,
  recipeById,
  draftById,
  getRecipeCatalogStatus = () => "ready",
  getSelectedRecipeId,
  setSelectedRecipeId,
  getRecipeSearch,
  setRecipeSearch,
  getCategoryFilter,
  setCategoryFilter,
  setDetailStatus,
  onRecipeOpen = () => {},
  isRecipeTranslationPending = () => false,
  getRecipeMemory = () => ({}),
  onRecipeMediaRendered = () => {},
  setView,
  calendarMealForDateKey = () => ({}),
  getCalendarMeals = () => ({}),
  setCalendarMeals = () => {},
  saveSchedule = async () => true,
  render = () => {},
  clearDirtyForm = () => {},
}) {
  let lastLibraryButton = null;
  let browseLayout = "grid";

  function requiredText(value) {
    return exactText(value) || fallbackText(value) || t("translationPendingShort");
  }

  function exactText(value) {
    const lang = getLang();
    const text = localizedTextExact(value, lang);
    return text && textMatchesLanguage(text, lang) ? text : "";
  }

  function fallbackText(value) {
    const text = localize(value) || localizeExact(value);
    return isMeaningfulText(text) ? text : "";
  }

  function usableLines(value) {
    return (Array.isArray(value) ? value : [])
      .map((line) => `${line || ""}`.trim())
      .filter((line) => isUsableRecipeLine(line));
  }

  function localizedLines(value) {
    const lang = getLang();
    const lines = usableLines(value?.[lang]);
    if (lines.length && linesMatchLanguage(lines, lang)) {
      return { lines, fallback: false };
    }
    const fallbackLang = lang === "es" ? "en" : "es";
    const fallbackLines = usableLines(value?.[fallbackLang]);
    return {
      lines: fallbackLines.length && linesMatchLanguage(fallbackLines, fallbackLang) ? fallbackLines : [],
      fallback: Boolean(fallbackLines.length),
    };
  }

  function displayText(value) {
    const translated = exactText(value);
    if (translated) return { text: translated, fallback: false };
    const fallback = fallbackText(value);
    return { text: fallback, fallback: Boolean(fallback) };
  }

  function memoryCopy(memory = {}) {
    const list = new Intl.ListFormat(getLang() === "es" ? "es" : "en", { style: "long", type: "conjunction" });
    if (memory.fact === "everyoneAte") return t("memoryEveryoneAte");
    if (memory.fact === "liked" && memory.likedNames?.length) return t("memoryPeopleLiked").replace("{names}", list.format(memory.likedNames));
    if (memory.fact === "skipped" && memory.skippedNames?.length) return t("memoryPeopleSkipped").replace("{names}", list.format(memory.skippedNames));
    if (memory.fact === "familyLoved") return t("memoryFamilyLoved");
    return "";
  }

  function memoryWhen(memory = {}) {
    if (!memory.lastMade) return "";
    const made = new Date(`${memory.lastMade}T12:00:00`);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const days = Math.max(0, Math.round((today.getTime() - made.getTime()) / 86400000));
    if (days === 0) return t("memoryMadeToday");
    if (days === 1) return t("memoryMadeYesterday");
    return t("memoryMadeDaysAgo").replace("{count}", `${days}`);
  }

  function photoRegion(recipe, name) {
    return recipeBrowsePhotoMarkup(recipe, name, escapeHtml);
  }

  function recipeCardMarkup(recipe, index, { pick = false, pickReason = "", layout = browseLayout } = {}) {
    const name = requiredText(recipe.name);
    const meta = displayText(recipe.meta).text;
    const photo = photoRegion(recipe, name);
    const pickLabel = pick
      ? t(pickReason === "recent" ? "recipePickRecent" : "recipePickFavorite")
      : "";
    const favoriteMark = getFavorites().includes(recipe.id)
      ? `<span class="favorite-pill" aria-label="${t("removeFavorite")}">★</span>`
      : "";
    const warningMark = hasLocalizedContent(recipe.allergyWarning)
      ? `<span class="warning-pill">${t("allergyBadge")}</span>`
      : "";
    if (pick) {
      return `
      <button class="recipe-card recipe-pick-card ${photo.mediaClass}" type="button" data-open="${escapeHtml(recipe.id)}">
        ${photo.markup}
        ${pickLabel ? `<span class="recipe-pick-label">${escapeHtml(pickLabel)}</span>` : ""}
        ${favoriteMark}
        <h3>${escapeHtml(name)}</h3>
      </button>
    `;
    }
    if (layout === "list") {
      return `
      <article class="recipe-browse-card library-list-card ${photo.mediaClass}">
        <button class="recipe-card" type="button" data-open="${escapeHtml(recipe.id)}">
          ${photo.markup}
          <span class="category-pill">${escapeHtml(categoryLabel(categoryFor(recipe)))}</span>
          ${favoriteMark}
          ${warningMark}
          <h3>${escapeHtml(name)}</h3>
          ${meta ? `<p>${escapeHtml(meta)}</p>` : ""}
        </button>
        <button class="soft-action recipe-add-meal" type="button" data-open="${escapeHtml(recipe.id)}">${escapeHtml(t("addRecipeToMeal"))}</button>
      </article>
    `;
    }
    return `
      <article class="recipe-browse-card library-grid-card ${photo.mediaClass}">
        <button class="recipe-card" type="button" data-open="${escapeHtml(recipe.id)}">
          ${photo.markup}
          ${favoriteMark}
          ${warningMark}
          <h3>${escapeHtml(name)}</h3>
        </button>
      </article>
    `;
  }

  function renderRecipes() {
    const search = getRecipeSearch().trim().toLowerCase();
    const categoryFilter = getCategoryFilter();
    const catalogStatus = getRecipeCatalogStatus();
    const recipes = catalogStatus === "ready" ? allRecipes() : [];
    const filtered = recipes.filter((recipe) => {
      const categoryMatch = categoryFilter === "all" || categoryFor(recipe) === categoryFilter;
      const haystack = [
        ...[recipe.name, recipe.meta, recipe.short, recipe.tags].flatMap(allLocalizedText),
        categoryLabel(categoryFor(recipe)),
      ].join(" ").toLowerCase();
      return categoryMatch && (!search || haystack.includes(search));
    });

    const picks = catalogStatus === "ready"
      ? libraryStripRecipes({
        recipes,
        favoriteIds: getFavorites(),
        getRecipeMemory,
      })
      : [];

    $("#recipeCount").textContent = catalogStatus === "loading"
      ? t("recipeCatalogLoading")
      : catalogStatus === "unavailable"
        ? t("recipeCatalogUnavailable").replace("{count}", recipes.length)
        : t(filtered.length === recipes.length ? "recipeCount" : "recipeCountFiltered")
          .replace("{count}", filtered.length)
          .replace("{total}", recipes.length);
    $("#recipePicksList").innerHTML = picks
      .map(({ recipe, reason }, index) => recipeCardMarkup(recipe, index, { pick: true, pickReason: reason }))
      .join("");
    if ($("#recipePicksEmpty")) $("#recipePicksEmpty").hidden = picks.length > 0;
    if ($("#recipePicksSection")) {
      $("#recipePicksSection").hidden = Boolean(search) || picks.length === 0;
    }
    syncBrowseLayoutControls();
    if ($("#recipeSearch") && globalThis.document?.activeElement !== $("#recipeSearch")) {
      $("#recipeSearch").value = getRecipeSearch();
    }
    if ($("#recipeList")?.classList) {
      $("#recipeList").classList.toggle("library-browse-grid", browseLayout === "grid");
      $("#recipeList").classList.toggle("library-browse-list", browseLayout === "list");
    }
    $("#recipeList").innerHTML = catalogStatus === "loading"
      ? `<p class="empty-state">${t("recipeCatalogLoading")}<br><button class="ghost-button compact-button" type="button" data-retry-recipe-catalog>${t("retrySync")}</button></p>`
      : catalogStatus === "unavailable"
        ? `<p class="empty-state">${t("recipeCatalogUnavailable")}<br><button class="ghost-button compact-button" type="button" data-retry-recipe-catalog>${t("retrySync")}</button></p>`
        : filtered.map((recipe, index) => recipeCardMarkup(recipe, index)).join("");
    if (catalogStatus === "ready" && !filtered.length) {
      const catalogIsEmpty = recipes.length === 0 && !search && categoryFilter === "all";
      $("#recipeList").innerHTML = catalogIsEmpty
        ? `<div class="empty-state recipe-catalog-empty"><strong>${t("recipeCatalogEmpty")}</strong><span>${t("recipeCatalogEmptyNote")}</span></div>`
        : `<p class="empty-state">${t("noMatchingRecipes")}</p>`;
    }
    onRecipeMediaRendered();
  }

  function renderLocalizedList(list, emptyNode, lines, emptyKey) {
    if (list) {
      list.innerHTML = lines.length
        ? lines.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
        : "";
      list.hidden = !lines.length;
    }
    if (emptyNode) {
      emptyNode.hidden = Boolean(lines.length);
      emptyNode.textContent = lines.length ? "" : t(emptyKey);
    }
  }

  function renderDetail() {
    const recipe = recipeById(getSelectedRecipeId());
    if (!recipe) {
      $("#recipeDetail").hidden = true;
      $("#recipesView").classList.remove("detail-open");
      return;
    }
    const isLocalDraft = Boolean(draftById(recipe.id));
    const nameDisplay = displayText(recipe.name);
    const metaDisplay = displayText(recipe.meta);
    const ingredientsDisplay = localizedLines(recipe.ingredients);
    const stepsDisplay = localizedLines(recipe.steps);
    const hasWarning = hasLocalizedContent(recipe.allergyWarning);
    const warningTranslated = exactText(recipe.allergyWarning);
    const warningFallback = fallbackText(recipe.allergyWarning);
    const warningReady = !hasWarning || Boolean(warningTranslated);
    const contentReady = Boolean(
      nameDisplay.text
      && ingredientsDisplay.lines.length
      && stepsDisplay.lines.length
      && warningReady
    );
    const usingFallback = Boolean(
      nameDisplay.fallback
      || metaDisplay.fallback
      || ingredientsDisplay.fallback
      || stepsDisplay.fallback
      || (hasWarning && !warningTranslated && warningFallback)
      || displayText(recipe.notes).fallback
    );
    const warning = hasWarning
      ? warningTranslated || warningFallback || t("safetyTranslationPending")
      : "";
    const actionLockReason = hasWarning && !warningTranslated
      ? t("safetyActionsLocked")
      : contentReady ? "" : t("recipeDetailsRequired");
    const translationPending = isRecipeTranslationPending(recipe.id, getLang());
    const showTranslationState = translationPending || !contentReady || usingFallback;
    const actionsLocked = showTranslationState;
    $("#recipeDetail").classList.remove("editing");
    $("#recipeMoreActions").open = false;
    if ($("#recipeOutcomePanel")) $("#recipeOutcomePanel").hidden = true;
    $("#editRecipeForm").hidden = true;
    $("#detailName").textContent = nameDisplay.text || t("translationPendingShort");
    const servings = servingsForRecipe(recipe);
    $("#detailMeta").textContent = [
      servings ? t("tonightServes").replace("{count}", `${servings}`) : "",
      metaDisplay.text,
    ].filter(Boolean).join(" · ");
    const memory = getRecipeMemory(recipe.id);
    if ($("#detailServings")) {
      $("#detailServings").textContent = "";
      $("#detailServings").hidden = true;
    }
    if ($("#detailMemory")) {
      const fact = memoryCopy(memory);
      const when = memoryWhen(memory);
      if ($("#detailMemoryFact")) $("#detailMemoryFact").textContent = fact;
      if ($("#detailMemoryWhen")) $("#detailMemoryWhen").textContent = when;
      $("#detailMemory").hidden = !fact && !when;
    }
    $("#allergyWarning").hidden = !warning;
    $("#allergyWarning").textContent = warning;
    $("#recipeTranslationPanel").hidden = !showTranslationState;
    $("#recipeTranslationStatus").textContent = usingFallback
      ? translationPending ? t("translatingRecipe") : t("translationFallbackDetail")
      : contentReady ? "" : t("translationPendingDetail");
    renderLocalizedList($("#ingredientList"), $("#ingredientListEmpty"), ingredientsDisplay.lines, "recipeIngredientsEmpty");
    renderLocalizedList($("#stepList"), $("#stepListEmpty"), stepsDisplay.lines, "recipeStepsEmpty");
    $("#familyNotes").textContent = displayText(recipe.notes).text || (contentReady ? "" : t("translationPendingShort"));
    const photos = Array.isArray(recipe.photos) ? recipe.photos : [];
    $("#photoStrip").innerHTML = photos
      .map((src, index) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(`${nameDisplay.text || t("translationPendingShort")} ${t("sourcePhoto")} ${index + 1}`)}" loading="lazy" decoding="async" />`)
      .join("");
    if ($("#recipePhotoRegion")) $("#recipePhotoRegion").hidden = photos.length === 0;
    $("#recipeDetail").classList.toggle("has-photos", photos.length > 0);
    const isFavorite = getFavorites().includes(recipe.id);
    $("#favoriteRecipe").textContent = t(isFavorite ? "removeFavorite" : "addFavorite");
    $("#favoriteRecipe").setAttribute("aria-pressed", `${isFavorite}`);
    $("#publishDraftRecipe").hidden = !isLocalDraft;
    $("#addRecipeGroceries").textContent = t("addRecipeToGroceries");
    $("#addRecipeGroceries").hidden = actionsLocked;
    $("#addRecipeGroceries").disabled = actionsLocked;
    if ($("#markCooked")) $("#markCooked").disabled = actionsLocked;
    if ($("#startCooking")) {
      $("#startCooking").disabled = actionsLocked;
      $("#startCooking").textContent = t("cookButton");
    }
    $("#recipeSafetyLockReason").hidden = !actionLockReason;
    $("#recipeSafetyLockReason").textContent = actionLockReason;
    const addForm = $("#addRecipeToMealForm");
    const addSubmit = $("#addRecipeToMealSubmit");
    if (addForm) {
      addForm.hidden = actionsLocked;
      addForm.classList.toggle("is-locked", actionsLocked);
      addForm.setAttribute("aria-disabled", `${actionsLocked}`);
    }
    ["#addRecipeToMealDate", "#addRecipeToMealPeriod"].forEach((selector) => {
      const control = $(selector);
      if (control) control.disabled = actionsLocked;
    });
    if (addSubmit) addSubmit.disabled = actionsLocked;
    renderMealDateOptions();
    setDetailStatus("");
  }

  function mealDateLabel(dateKey, offset) {
    if (offset === 0) return t("addRecipeToMealToday");
    if (offset === 1) return t("addRecipeToMealTomorrow");
    const date = new Date(`${dateKey}T12:00:00`);
    return new Intl.DateTimeFormat(getLang() === "es" ? "es-US" : "en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(date);
  }

  function renderMealDateOptions() {
    const select = $("#addRecipeToMealDate");
    if (!select) return;
    const current = select.value;
    const options = upcomingMealDateOptions(new Date(), 7);
    select.innerHTML = options.map((option) => (
      `<option value="${escapeHtml(option.dateKey)}">${escapeHtml(mealDateLabel(option.dateKey, option.offset))}</option>`
    )).join("");
    select.value = options.some((option) => option.dateKey === current) ? current : options[0]?.dateKey || "";
  }

  function bindOpenButtons() {
    $$("[data-open]").forEach((button) => {
      button.addEventListener("click", () => {
        lastLibraryButton = button.closest?.("#recipeList") ? button : null;
        setView("recipes");
        setSelectedRecipeId(button.dataset.open);
        renderDetail();
        $("#recipesView").classList.add("detail-open");
        $("#recipeDetail").hidden = false;
        $("#recipeDetail").scrollIntoView({ behavior: "auto", block: "start" });
        $("#detailName").focus({ preventScroll: true });
        onRecipeOpen(button.dataset.open);
      });
    });
  }

  function syncBrowseLayoutControls() {
    const gridButton = $("#libraryBrowseGrid");
    const listButton = $("#libraryBrowseList");
    if (gridButton) {
      gridButton.classList.toggle("active", browseLayout === "grid");
      gridButton.setAttribute("aria-pressed", `${browseLayout === "grid"}`);
    }
    if (listButton) {
      listButton.classList.toggle("active", browseLayout === "list");
      listButton.setAttribute("aria-pressed", `${browseLayout === "list"}`);
    }
    if ($("#recipeBrowse")) {
      if ($("#recipeBrowse").dataset) $("#recipeBrowse").dataset.browseLayout = browseLayout;
      else $("#recipeBrowse").setAttribute?.("data-browse-layout", browseLayout);
    }
  }

  function setBrowseLayout(nextLayout) {
    browseLayout = nextLayout === "list" ? "list" : "grid";
    renderRecipes();
    bindOpenButtons();
  }

  function bindLibraryControls() {
    $("#closeRecipeDetail").addEventListener("click", () => {
      $("#recipeDetail").hidden = true;
      $("#recipesView").classList.remove("detail-open");
      $("#recipeDetail").classList.remove("editing");
      $("#editRecipeForm").hidden = true;
      clearDirtyForm($("#editRecipeForm"));
      setDetailStatus("");
      if (lastLibraryButton) {
        lastLibraryButton.focus();
        return;
      }
      $("#recipeSearch").focus();
    });

    $("#recipeSearch").addEventListener("input", (event) => {
      setRecipeSearch(event.target.value);
      renderRecipes();
      bindOpenButtons();
    });

    $("#categoryFilter").addEventListener("change", (event) => {
      setCategoryFilter(event.target.value);
      renderRecipes();
      bindOpenButtons();
    });

    $("#libraryBrowseGrid")?.addEventListener("click", () => setBrowseLayout("grid"));
    $("#libraryBrowseList")?.addEventListener("click", () => setBrowseLayout("list"));

    $("#addRecipeToMealForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const recipe = recipeById(getSelectedRecipeId());
      const dateKey = $("#addRecipeToMealDate")?.value || "";
      const period = $("#addRecipeToMealPeriod")?.value || "dinner";
      const status = $("#addRecipeToMealStatus");
      if (!recipe || !dateKey) return;
      const category = categoryFor(recipe);
      const role = mealRoles.some((item) => item.key === category) ? category : "other";
      const nextMeal = appendRecipeToMeal(calendarMealForDateKey(dateKey), {
        recipeId: recipe.id,
        period,
        role,
      });
      setCalendarMeals({ ...getCalendarMeals(), [dateKey]: nextMeal });
      if (status) status.textContent = "";
      render();
      const saved = await saveSchedule();
      if (status) {
        status.textContent = saved === false
          ? t("addRecipeToMealFailed")
          : t("addRecipeToMealSaved")
            .replace("{meal}", t(`${period}Slot`))
            .replace("{date}", mealDateLabel(dateKey, upcomingMealDateOptions(new Date(), 7).find((option) => option.dateKey === dateKey)?.offset));
      }
    });
  }

  return {
    bindLibraryControls,
    bindOpenButtons,
    renderDetail,
    renderRecipes,
  };
}
