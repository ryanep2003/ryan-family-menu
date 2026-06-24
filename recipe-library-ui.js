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
}) {
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

    $("#recipeCount").textContent = `${filtered.length}/${recipes.length}`;
    $("#recipeList").innerHTML = filtered
      .map((recipe) => `
        <button class="recipe-card" type="button" data-open="${recipe.id}">
          <img src="${recipe.photos[0]}" alt="" />
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
      $("#recipeList").innerHTML = `<p class="empty-state">${getLang() === "en" ? "No matching recipes." : "No hay recetas que coincidan."}</p>`;
    }
  }

  function renderDetail() {
    const recipe = recipeById(getSelectedRecipeId());
    const isLocalDraft = Boolean(draftById(recipe.id));
    const warning = recipe.allergyWarning ? localize(recipe.allergyWarning) : "";
    $("#editRecipeForm").hidden = true;
    $("#detailName").textContent = localize(recipe.name);
    $("#detailMeta").textContent = localize(recipe.meta);
    $("#allergyWarning").hidden = !warning;
    $("#allergyWarning").textContent = warning;
    $("#ingredientList").innerHTML = (recipe.ingredients[getLang()] || recipe.ingredients.en).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    $("#stepList").innerHTML = (recipe.steps[getLang()] || recipe.steps.en).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    $("#familyNotes").textContent = localize(recipe.notes);
    $("#photoStrip").innerHTML = recipe.photos.map((src) => `<img src="${src}" alt="" />`).join("");
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
        setSelectedRecipeId(button.dataset.open);
        renderDetail();
        $("#recipeDetail").hidden = false;
        $("#recipeDetail").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function bindLibraryControls() {
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
