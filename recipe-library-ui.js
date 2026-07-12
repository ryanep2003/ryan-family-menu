import { allLocalizedText, hasLocalizedContent } from "./localized-data.js";
import { linesMatchLanguage } from "./language-quality.js";
import { cardPhotoFor, cardPhotoIsGenerated } from "./recipe-utils.js";

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
  getSelectedRecipeId,
  setSelectedRecipeId,
  getRecipeSearch,
  setRecipeSearch,
  getCategoryFilter,
  setCategoryFilter,
  setDetailStatus,
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

  function renderRecipes() {
    const search = getRecipeSearch().trim().toLowerCase();
    const categoryFilter = getCategoryFilter();
    const recipes = allRecipes();
    const filtered = recipes.filter((recipe) => {
      const categoryMatch = categoryFilter === "all" || categoryFor(recipe) === categoryFilter;
      const haystack = [
        ...[recipe.name, recipe.meta, recipe.short, recipe.tags].flatMap(allLocalizedText),
        categoryLabel(categoryFor(recipe)),
      ].join(" ").toLowerCase();
      return categoryMatch && (!search || haystack.includes(search));
    });

    $("#recipeCount").textContent = t(filtered.length === recipes.length ? "recipeCount" : "recipeCountFiltered")
      .replace("{count}", filtered.length)
      .replace("{total}", recipes.length);
    $("#recipeList").innerHTML = filtered
      .map((recipe, index) => {
        const name = requiredText(recipe.name);
        const meta = displayText(recipe.meta).text;
        const short = displayText(recipe.short).text;
        const cardPhoto = cardPhotoFor(recipe);
        return `
        <button class="recipe-card" style="--card-order: ${Math.min(index, 8)}" type="button" data-open="${escapeHtml(recipe.id)}">
          <img src="${escapeHtml(cardPhoto)}" alt="${cardPhotoIsGenerated(recipe) ? "" : escapeHtml(name)}" loading="lazy" decoding="async" />
          <span class="category-pill">${escapeHtml(categoryLabel(categoryFor(recipe)))}</span>
          ${getFavorites().includes(recipe.id) ? `<span class="favorite-pill" aria-label="${t("removeFavorite")}">★</span>` : ""}
          ${hasLocalizedContent(recipe.allergyWarning) ? `<span class="warning-pill">${t("allergyBadge")}</span>` : ""}
          <h3>${escapeHtml(name)}</h3>
          ${meta ? `<p>${escapeHtml(meta)}</p>` : ""}
          ${short ? `<p>${escapeHtml(short)}</p>` : ""}
        </button>
      `;
      })
      .join("");
    if (!filtered.length) {
      $("#recipeList").innerHTML = `<p class="empty-state">${t("noMatchingRecipes")}</p>`;
    }
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
    $("#recipeDetail").classList.remove("editing");
    $("#recipeMoreActions").open = false;
    $("#editRecipeForm").hidden = true;
    $("#detailName").textContent = nameDisplay.text || t("translationPendingShort");
    $("#detailMeta").textContent = metaDisplay.text;
    $("#allergyWarning").hidden = !warning;
    $("#allergyWarning").textContent = warning;
    $("#recipeTranslationStatus").hidden = !usingFallback && contentReady;
    $("#recipeTranslationStatus").textContent = usingFallback
      ? t("translationFallbackDetail")
      : contentReady ? "" : t("translationPendingDetail");
    $("#ingredientList").innerHTML = ingredientsDisplay.lines.length
      ? ingredientsDisplay.lines.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
      : `<li class="translation-placeholder">${t("translationPendingShort")}</li>`;
    $("#stepList").innerHTML = stepsDisplay.lines.length
      ? stepsDisplay.lines.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
      : `<li class="translation-placeholder">${t("translationPendingShort")}</li>`;
    $("#familyNotes").textContent = displayText(recipe.notes).text || (contentReady ? "" : t("translationPendingShort"));
    $("#photoStrip").innerHTML = recipe.photos
      .map((src, index) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(`${nameDisplay.text || t("translationPendingShort")} ${t("sourcePhoto")} ${index + 1}`)}" loading="lazy" decoding="async" />`)
      .join("");
    const isFavorite = getFavorites().includes(recipe.id);
    $("#favoriteRecipe").textContent = t(isFavorite ? "removeFavorite" : "addFavorite");
    $("#favoriteRecipe").setAttribute("aria-pressed", `${isFavorite}`);
    $("#publishDraftRecipe").hidden = !isLocalDraft;
    $("#addRecipeGroceries").textContent = t("addRecipeToGroceries");
    $("#addRecipeGroceries").disabled = !contentReady;
    $("#markCooked").disabled = !contentReady;
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
