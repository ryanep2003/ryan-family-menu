export function createRecipeLibraryUi({
  $,
  $$,
  t,
  escapeHtml,
  localize,
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

  function renderRecipes() {
    const search = getRecipeSearch().trim().toLowerCase();
    const categoryFilter = getCategoryFilter();
    const recipes = allRecipes();
    const filtered = recipes.filter((recipe) => {
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

    $("#recipeCount").textContent = t(filtered.length === recipes.length ? "recipeCount" : "recipeCountFiltered")
      .replace("{count}", filtered.length)
      .replace("{total}", recipes.length);
    $("#recipeList").innerHTML = filtered
      .map((recipe, index) => `
        <button class="recipe-card" style="--card-order: ${Math.min(index, 8)}" type="button" data-open="${escapeHtml(recipe.id)}">
          <img src="${escapeHtml(recipe.photos[0])}" alt="${escapeHtml(localize(recipe.name))}" loading="lazy" decoding="async" />
          <span class="category-pill">${escapeHtml(categoryLabel(categoryFor(recipe)))}</span>
          ${getFavorites().includes(recipe.id) ? `<span class="favorite-pill" aria-label="${t("removeFavorite")}">★</span>` : ""}
          ${recipe.allergyWarning ? `<span class="warning-pill">${t("allergyBadge")}</span>` : ""}
          <h3>${escapeHtml(localize(recipe.name))}</h3>
          <p>${escapeHtml(localize(recipe.meta))}</p>
          <p>${escapeHtml(localize(recipe.short))}</p>
        </button>
      `)
      .join("");
    if (!filtered.length) {
      $("#recipeList").innerHTML = `<p class="empty-state">${t("noMatchingRecipes")}</p>`;
    }
  }

  function renderDetail() {
    const recipe = recipeById(getSelectedRecipeId());
    const isLocalDraft = Boolean(draftById(recipe.id));
    const warning = recipe.allergyWarning ? localize(recipe.allergyWarning) : "";
    $("#recipeDetail").classList.remove("editing");
    $("#editRecipeForm").hidden = true;
    $("#detailName").textContent = localize(recipe.name);
    $("#detailMeta").textContent = localize(recipe.meta);
    $("#allergyWarning").hidden = !warning;
    $("#allergyWarning").textContent = warning;
    $("#ingredientList").innerHTML = (recipe.ingredients[getLang()] || recipe.ingredients.en).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    $("#stepList").innerHTML = (recipe.steps[getLang()] || recipe.steps.en).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    $("#familyNotes").textContent = localize(recipe.notes);
    $("#photoStrip").innerHTML = recipe.photos
      .map((src, index) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(`${localize(recipe.name)} ${t("sourcePhoto")} ${index + 1}`)}" loading="lazy" decoding="async" />`)
      .join("");
    const isFavorite = getFavorites().includes(recipe.id);
    $("#favoriteRecipe").textContent = t(isFavorite ? "removeFavorite" : "addFavorite");
    $("#favoriteRecipe").setAttribute("aria-pressed", `${isFavorite}`);
    $("#publishDraftRecipe").hidden = !isLocalDraft;
    $("#addRecipeGroceries").textContent = t("addRecipeToGroceries");
    setDetailStatus("");
  }

  function bindOpenButtons() {
    $$("[data-open]").forEach((button) => {
      button.addEventListener("click", () => {
        lastLibraryButton = button.closest?.("#recipeList") ? button : null;
        setView("recipes");
        setSelectedRecipeId(button.dataset.open);
        renderDetail();
        $("#recipeDetail").hidden = false;
        $("#recipeDetail").scrollIntoView({ behavior: "auto", block: "start" });
        $("#detailName").focus({ preventScroll: true });
      });
    });
  }

  function bindLibraryControls() {
    $("#closeRecipeDetail").addEventListener("click", () => {
      $("#recipeDetail").hidden = true;
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
