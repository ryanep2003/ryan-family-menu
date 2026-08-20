import { allLocalizedText, hasLocalizedContent } from "./localized-data.js";
import { linesMatchLanguage } from "./language-quality.js";
import { cardPhotoFor, cardPhotoIsGenerated, servingsForRecipe } from "./recipe-utils.js";

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
  getPlannedRecipeIds = () => [],
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
  canTranslateRecipe = () => false,
  isRecipeTranslationPending = () => false,
  getRecipeMemory = () => ({}),
  onRecipeMediaRendered = () => {},
  setView,
}) {
  let lastLibraryButton = null;

  function requiredText(value) {
    return localizeExact(value) || localize(value) || t("translationPendingShort");
  }

  function localizedLines(value) {
    const lang = getLang();
    const lines = value?.[lang] || [];
    if (lines.length && linesMatchLanguage(lines, lang)) {
      return { lines, fallback: false };
    }
    const fallbackLang = lang === "es" ? "en" : "es";
    const fallbackLines = value?.[fallbackLang] || [];
    return {
      lines: fallbackLines.length && linesMatchLanguage(fallbackLines, fallbackLang) ? fallbackLines : [],
      fallback: Boolean(fallbackLines.length),
    };
  }

  function displayText(value) {
    const translated = localizeExact(value);
    if (translated) return { text: translated, fallback: false };
    const fallback = localize(value);
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

  function recipeCardMarkup(recipe, index, { pick = false, plannedIds = new Set() } = {}) {
    const name = requiredText(recipe.name);
    const meta = displayText(recipe.meta).text;
    const short = displayText(recipe.short).text;
    const cardPhoto = cardPhotoFor(recipe);
    const hasPhoto = !cardPhotoIsGenerated(recipe) && Boolean(cardPhoto);
    const canHydratePhoto = !hasPhoto && recipe.hasSourcePhotos;
    const pickLabel = pick
      ? plannedIds.has(recipe.id) ? t("recipePickPlanned") : t("recipePickFavorite")
      : "";
    return `
      <button class="recipe-card${pick ? " recipe-pick-card" : ""}${hasPhoto || canHydratePhoto ? " has-media" : " no-media"}" style="--card-order: ${Math.min(index, 8)}" type="button" data-open="${escapeHtml(recipe.id)}">
        ${hasPhoto
          ? `<span class="recipe-photo-shell is-loaded"><img src="${escapeHtml(cardPhoto)}" alt="${escapeHtml(name)}" loading="lazy" decoding="async" /></span>`
          : canHydratePhoto
            ? `<span class="recipe-photo-shell" data-recipe-photo-id="${escapeHtml(recipe.id)}" data-recipe-photo-alt="${escapeHtml(name)}" aria-hidden="true"></span>`
            : ""}
        ${pickLabel ? `<span class="recipe-pick-label">${escapeHtml(pickLabel)}</span>` : ""}
        <span class="category-pill">${escapeHtml(categoryLabel(categoryFor(recipe)))}</span>
        ${getFavorites().includes(recipe.id) ? `<span class="favorite-pill" aria-label="${t("removeFavorite")}">★</span>` : ""}
        ${hasLocalizedContent(recipe.allergyWarning) ? `<span class="warning-pill">${t("allergyBadge")}</span>` : ""}
        <h3>${escapeHtml(name)}</h3>
        ${meta ? `<p>${escapeHtml(meta)}</p>` : ""}
        ${short ? `<p>${escapeHtml(short)}</p>` : ""}
      </button>
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

    const favoriteIds = new Set(getFavorites());
    const plannedIds = new Set(getPlannedRecipeIds());
    const picks = recipes
      .filter((recipe) => favoriteIds.has(recipe.id) || plannedIds.has(recipe.id))
      .sort((left, right) => (
        Number(plannedIds.has(right.id)) - Number(plannedIds.has(left.id))
        || Number(favoriteIds.has(right.id)) - Number(favoriteIds.has(left.id))
      ));

    $("#recipeCount").textContent = catalogStatus === "loading"
      ? t("recipeCatalogLoading")
      : catalogStatus === "unavailable"
        ? t("recipeCatalogUnavailable").replace("{count}", recipes.length)
        : t(filtered.length === recipes.length ? "recipeCount" : "recipeCountFiltered")
          .replace("{count}", filtered.length)
          .replace("{total}", recipes.length);
    $("#recipePicksList").innerHTML = picks.slice(0, 6)
      .map((recipe, index) => recipeCardMarkup(recipe, index, { pick: true, plannedIds }))
      .join("");
    $("#recipePicksEmpty").hidden = picks.length > 0;
    if ($("#recipePicksSection")) {
      $("#recipePicksSection").hidden = catalogStatus === "ready" && recipes.length === 0;
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

  function renderDetail() {
    const recipe = recipeById(getSelectedRecipeId());
    const isLocalDraft = Boolean(draftById(recipe.id));
    const nameDisplay = displayText(recipe.name);
    const metaDisplay = displayText(recipe.meta);
    const ingredientsDisplay = localizedLines(recipe.ingredients);
    const stepsDisplay = localizedLines(recipe.steps);
    const hasWarning = hasLocalizedContent(recipe.allergyWarning);
    const warningTranslated = localizeExact(recipe.allergyWarning);
    const warningFallback = localize(recipe.allergyWarning);
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
    const canTranslate = canTranslateRecipe(recipe.id, getLang());
    const translationPending = isRecipeTranslationPending(recipe.id, getLang());
    const showTranslationState = canTranslate || !contentReady;
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
      ? t("translationFallbackDetail")
      : contentReady ? "" : t("translationPendingDetail");
    $("#translateSelectedRecipe").hidden = !canTranslate;
    $("#translateSelectedRecipe").disabled = translationPending;
    $("#translateSelectedRecipe").textContent = t(translationPending ? "translatingRecipe" : "translateRecipe");
    $("#ingredientList").innerHTML = ingredientsDisplay.lines.length
      ? ingredientsDisplay.lines.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
      : `<li class="translation-placeholder">${t("translationPendingShort")}</li>`;
    $("#stepList").innerHTML = stepsDisplay.lines.length
      ? stepsDisplay.lines.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
      : `<li class="translation-placeholder">${t("translationPendingShort")}</li>`;
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
    $("#addRecipeGroceries").disabled = !contentReady;
    if ($("#markCooked")) $("#markCooked").disabled = !contentReady;
    if ($("#startCooking")) $("#startCooking").disabled = !contentReady;
    if ($("#startCooking")) $("#startCooking").textContent = t("cookButton");
    $("#recipeSafetyLockReason").hidden = !actionLockReason;
    $("#recipeSafetyLockReason").textContent = actionLockReason;
    setDetailStatus("");
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

  function bindLibraryControls() {
    $("#closeRecipeDetail").addEventListener("click", () => {
      $("#recipeDetail").hidden = true;
      $("#recipesView").classList.remove("detail-open");
      $("#recipeDetail").classList.remove("editing");
      $("#editRecipeForm").hidden = true;
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
  }

  return {
    bindLibraryControls,
    bindOpenButtons,
    renderDetail,
    renderRecipes,
  };
}
