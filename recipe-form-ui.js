const FALLBACK_PHOTO = "assets/meatballs-2.jpg";

export function createRecipeFormUi({
  $,
  t,
  escapeHtml,
  localize,
  recipeToEditableUpload,
  readFilesAsDataUrls,
  recognizeRecipe,
  importRecipeUrl,
  saveSharedRecipe,
  saveSharedState,
  recipeById,
  allRecipes,
  getSelectedRecipeId,
  setSelectedRecipeId,
  setRecipeEdit,
  removeRecipeEdit,
  removeDeletedRecipeId,
  addDeletedRecipeId,
  getFavorites,
  setFavorites,
  getImportedRecipePhotos,
  setImportedRecipePhotos,
  prependSharedRecipe,
  prependDraft,
  persistDrafts,
  updateMealsAfterRecipeDelete,
  setView,
  render,
  renderRecipes,
  setDetailStatus,
}) {
  function fillUploadFormFromRecipe(recipe, { overwrite = false } = {}) {
    if ((overwrite || !$("#nameInput").value.trim()) && recipe.name) $("#nameInput").value = recipe.name;
    if (recipe.category) $("#categoryInput").value = recipe.category;
    if ((overwrite || !$("#ingredientsInput").value.trim()) && recipe.ingredientsText) $("#ingredientsInput").value = recipe.ingredientsText;
    if ((overwrite || !$("#stepsInput").value.trim()) && recipe.stepsText) $("#stepsInput").value = recipe.stepsText;
    if ((overwrite || !$("#allergyInput").value.trim()) && recipe.allergyWarning) $("#allergyInput").value = recipe.allergyWarning;
    if ((overwrite || !$("#noteInput").value.trim()) && recipe.notes) $("#noteInput").value = recipe.notes;
  }

  function renderEditPhotoPreview(photos) {
    $("#editPhotoPreview").innerHTML = photos
      .map((src) => `<img src="${escapeHtml(src)}" alt="" />`)
      .join("");
  }

  function populateEditRecipeForm(recipe) {
    const editable = recipeToEditableUpload(recipe);
    $("#editNameInput").value = editable.name;
    $("#editCategoryInput").value = editable.category;
    $("#editIngredientsInput").value = editable.ingredientsText;
    $("#editStepsInput").value = editable.stepsText;
    $("#editAllergyInput").value = editable.allergyWarning;
    $("#editNoteInput").value = editable.notes;
    $("#editPhotoInput").value = "";
    renderEditPhotoPreview(editable.photos);
  }

  async function submitRecipeEdit(event) {
    event.preventDefault();
    const selectedRecipeId = getSelectedRecipeId();
    const current = recipeById(selectedRecipeId);
    const name = $("#editNameInput").value.trim();
    if (!current || !name) return;
    const submitButton = $("#editRecipeForm .primary-action");
    submitButton.disabled = true;

    try {
      const replacementPhotos = await readFilesAsDataUrls($("#editPhotoInput").files, 3, {
        maxSide: 700,
        quality: 0.68,
        maxBytes: 420000,
      });

      setRecipeEdit(selectedRecipeId, {
        id: selectedRecipeId,
        name,
        category: $("#editCategoryInput").value,
        ingredientsText: $("#editIngredientsInput").value.trim(),
        stepsText: $("#editStepsInput").value.trim(),
        allergyWarning: $("#editAllergyInput").value.trim(),
        notes: $("#editNoteInput").value.trim(),
        photos: replacementPhotos.length
          ? replacementPhotos
          : current.photos?.length ? current.photos : [FALLBACK_PHOTO],
        updatedAt: new Date().toISOString(),
      });
      removeDeletedRecipeId(selectedRecipeId);
      $("#editRecipeForm").hidden = true;
      render();
      $("#recipeDetail").hidden = false;
      setDetailStatus(t("recipeUpdated"));
      await saveSharedState();
      setDetailStatus(t("recipeUpdated"));
    } catch (error) {
      console.warn(error);
      setDetailStatus(t("sharedRecipeError"), true);
    } finally {
      submitButton.disabled = false;
    }
  }

  async function deleteSelectedRecipe() {
    const selectedRecipeId = getSelectedRecipeId();
    const current = recipeById(selectedRecipeId);
    if (!current || !window.confirm(t("deleteRecipeConfirm"))) return;

    addDeletedRecipeId(selectedRecipeId);
    removeRecipeEdit(selectedRecipeId);
    setFavorites(getFavorites().filter((id) => id !== selectedRecipeId));
    updateMealsAfterRecipeDelete(selectedRecipeId);
    setSelectedRecipeId(allRecipes()[0]?.id || "meatballs");
    $("#editRecipeForm").hidden = true;
    render();
    $("#recipeDetail").hidden = true;
    const status = $("#sharedStateStatus");
    if (status) status.textContent = t("recipeDeleted");
    await saveSharedState();
    if (status) status.textContent = t("recipeDeleted");
  }

  async function scanRecipePhotos() {
    const files = $("#photoInput").files;
    if (!files.length) return;

    const status = $("#uploadStatus");
    status.textContent = t("recipeScanWorking");
    status.classList.remove("error");

    try {
      const images = await readFilesAsDataUrls(files, 3, {
        maxSide: 1100,
        quality: 0.74,
        maxBytes: 650000,
      });
      const recipe = await recognizeRecipe(images);
      fillUploadFormFromRecipe(recipe);
      status.textContent = t("recipeScanSaved");
    } catch (error) {
      console.warn(error);
      status.textContent = error.message || t("recipeScanError");
      status.classList.add("error");
    }
  }

  async function importRecipeFromUrl() {
    const url = $("#recipeUrlInput").value.trim();
    const status = $("#uploadStatus");
    if (!url) {
      status.textContent = t("recipeUrlRequired");
      status.classList.add("error");
      return;
    }

    const button = $("#importRecipeUrl");
    button.disabled = true;
    status.textContent = t("recipeUrlWorking");
    status.classList.remove("error");

    try {
      const recipe = await importRecipeUrl(url);
      fillUploadFormFromRecipe(recipe, { overwrite: true });
      setImportedRecipePhotos(Array.isArray(recipe.photos) ? recipe.photos : []);
      status.textContent = t("recipeUrlSaved");
    } catch (error) {
      console.warn(error);
      status.textContent = error.message || t("recipeUrlError");
      status.classList.add("error");
    } finally {
      button.disabled = false;
    }
  }

  async function submitUploadForm(event) {
    event.preventDefault();
    const name = $("#nameInput").value.trim();
    if (!name) return;

    const submitButton = $("#uploadForm .primary-action");
    const status = $("#uploadStatus");
    submitButton.disabled = true;
    status.textContent = t("savingRecipeLive");
    status.classList.remove("error");

    try {
      const photos = await readFilesAsDataUrls($("#photoInput").files, 3, {
        maxSide: 700,
        quality: 0.68,
        maxBytes: 420000,
      });
      const recipePhotos = photos.length ? photos : getImportedRecipePhotos();
      const recipe = {
        name,
        category: $("#categoryInput").value,
        ingredientsText: $("#ingredientsInput").value.trim(),
        stepsText: $("#stepsInput").value.trim(),
        allergyWarning: $("#allergyInput").value.trim(),
        notes: $("#noteInput").value.trim(),
        photos: recipePhotos.length ? recipePhotos : [FALLBACK_PHOTO],
      };
      const saved = await saveSharedRecipe(recipe);
      prependSharedRecipe(saved.recipe);
      $("#uploadForm").reset();
      setImportedRecipePhotos([]);
      status.textContent = t("sharedRecipeSaved");
      setView("recipes");
      render();
    } catch (error) {
      console.warn(error);
      const fallbackDraft = {
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        category: $("#categoryInput").value,
        ingredientsText: $("#ingredientsInput").value.trim(),
        stepsText: $("#stepsInput").value.trim(),
        allergyWarning: $("#allergyInput").value.trim(),
        notes: $("#noteInput").value.trim(),
        photos: getImportedRecipePhotos().length ? getImportedRecipePhotos() : [FALLBACK_PHOTO],
        createdAt: new Date().toISOString(),
      };
      prependDraft(fallbackDraft);
      persistDrafts();
      status.textContent = error.message
        ? `${t("localDraftSaved")} ${error.message}`
        : t("localDraftSaved");
      status.classList.add("error");
      renderRecipes();
    } finally {
      submitButton.disabled = false;
    }
  }

  function bind() {
    $("#editRecipe").addEventListener("click", () => {
      const recipe = recipeById(getSelectedRecipeId());
      if (!recipe) return;
      populateEditRecipeForm(recipe);
      $("#editRecipeForm").hidden = false;
      setDetailStatus("");
      $("#editRecipeForm").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    $("#cancelRecipeEdit").addEventListener("click", () => {
      $("#editRecipeForm").hidden = true;
      $("#editPhotoInput").value = "";
      setDetailStatus("");
    });

    $("#editPhotoInput").addEventListener("change", () => {
      const files = [...$("#editPhotoInput").files].slice(0, 3);
      if (!files.length) {
        renderEditPhotoPreview(recipeToEditableUpload(recipeById(getSelectedRecipeId())).photos);
        return;
      }

      renderEditPhotoPreview(files.map((file) => URL.createObjectURL(file)));
    });

    $("#editRecipeForm").addEventListener("submit", submitRecipeEdit);
    $("#deleteRecipe").addEventListener("click", deleteSelectedRecipe);
    $("#photoInput").addEventListener("change", scanRecipePhotos);
    $("#importRecipeUrl").addEventListener("click", importRecipeFromUrl);
    $("#uploadForm").addEventListener("submit", submitUploadForm);
  }

  return {
    bind,
  };
}
