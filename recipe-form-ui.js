import { updateLocalizedText } from "./localized-data.js";

const MAX_UPLOAD_PHOTOS = 3;
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
  getLang,
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
  let uploadPhotoFiles = [];

  function setEditMode(editing) {
    $("#recipeDetail").classList.toggle("editing", editing);
    $("#editRecipeForm").hidden = !editing;
  }

  function focusRecipeDetail() {
    $("#recipeDetail").scrollIntoView({ behavior: "auto", block: "start" });
    $("#detailName").focus({ preventScroll: true });
  }

  function focusRecipeEdit() {
    $("#recipeDetail").scrollIntoView({ behavior: "auto", block: "start" });
    $("#editNameInput").focus({ preventScroll: true });
  }

  function fillUploadFormFromRecipe(recipe, { overwrite = false } = {}) {
    if ((overwrite || !$("#nameInput").value.trim()) && recipe.name) $("#nameInput").value = recipe.name;
    if (recipe.category) $("#categoryInput").value = recipe.category;
    if ((overwrite || !$("#ingredientsInput").value.trim()) && recipe.ingredientsText) $("#ingredientsInput").value = recipe.ingredientsText;
    if ((overwrite || !$("#stepsInput").value.trim()) && recipe.stepsText) $("#stepsInput").value = recipe.stepsText;
    if ((overwrite || !$("#allergyInput").value.trim()) && recipe.allergyWarning) $("#allergyInput").value = recipe.allergyWarning;
    if ((overwrite || !$("#noteInput").value.trim()) && recipe.notes) $("#noteInput").value = recipe.notes;
  }

  function openRecipeDetails() {
    const disclosure = $("#recipeDetailsDisclosure");
    if (disclosure) disclosure.open = true;
  }

  function setRecipeSourceMode(mode) {
    const sources = [
      { mode: "photos", button: $("#usePhotoSource"), panel: $("#photoSourcePanel") },
      { mode: "url", button: $("#useUrlSource"), panel: $("#urlSourcePanel") },
      { mode: "manual", button: $("#useManualSource") },
    ];

    sources.forEach((source) => {
      const active = source.mode === mode;
      source.button.classList.toggle("active", active);
      source.button.setAttribute("aria-pressed", `${active}`);
      if (source.panel) source.panel.hidden = !active;
    });

    const disclosure = $("#recipeDetailsDisclosure");
    if (mode === "manual") openRecipeDetails();
    else if (disclosure) disclosure.open = false;
  }

  function renderEditPhotoPreview(photos) {
    $("#editPhotoPreview").innerHTML = photos
      .map((src) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(t("recipePhotoPreview"))}" loading="lazy" decoding="async" />`)
      .join("");
  }

  function selectedUploadPhotoFiles() {
    return uploadPhotoFiles;
  }

  function selectedEditPhotoFiles() {
    return [...$("#editPhotoInput").files, ...$("#editPhotoCameraInput").files];
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
    $("#editPhotoCameraInput").value = "";
    renderEditPhotoPreview(editable.photos);
  }

  function formatRecipePhotoStatus(count) {
    if (!count) return t("noRecipePhotosSelected");
    return t("recipePhotosSelected").replace("{count}", count);
  }

  function renderUploadPhotoQueue() {
    const count = uploadPhotoFiles.length;
    $("#selectedRecipePhotoStatus").textContent = formatRecipePhotoStatus(count);
    $("#scanRecipePhotos").disabled = count === 0;
    $("#clearRecipePhotos").disabled = count === 0;
  }

  function fileKey(file) {
    return [file.name, file.size, file.lastModified].join(":");
  }

  function appendUploadPhotoFiles(files) {
    const existing = new Set(uploadPhotoFiles.map(fileKey));
    const incoming = [...files].filter((file) => !existing.has(fileKey(file)));
    uploadPhotoFiles = [...uploadPhotoFiles, ...incoming].slice(0, MAX_UPLOAD_PHOTOS);
    $("#photoInput").value = "";
    $("#photoCameraInput").value = "";
    renderUploadPhotoQueue();
  }

  function clearUploadPhotoFiles() {
    uploadPhotoFiles = [];
    $("#photoInput").value = "";
    $("#photoCameraInput").value = "";
    renderUploadPhotoQueue();
  }

  function recipeFieldHasText(value) {
    if (typeof value === "string") return Boolean(value.trim());
    return Object.values(value || {}).some((entry) => typeof entry === "string" && entry.trim());
  }

  function recipePayload(name, recipePhotos) {
    return {
      name: updateLocalizedText("", name, getLang()),
      category: $("#categoryInput").value,
      ingredientsText: updateLocalizedText("", $("#ingredientsInput").value.trim(), getLang()),
      stepsText: updateLocalizedText("", $("#stepsInput").value.trim(), getLang()),
      allergyWarning: updateLocalizedText("", $("#allergyInput").value.trim(), getLang()),
      notes: updateLocalizedText("", $("#noteInput").value.trim(), getLang()),
      photos: recipePhotos.length ? recipePhotos : [FALLBACK_PHOTO],
    };
  }

  function clearUploadForm() {
    $("#uploadForm").reset();
    clearUploadPhotoFiles();
    setImportedRecipePhotos([]);
  }

  async function readUploadPhotos() {
    const photos = await readFilesAsDataUrls(selectedUploadPhotoFiles(), MAX_UPLOAD_PHOTOS, {
      maxSide: 700,
      quality: 0.68,
      maxBytes: 420000,
    });
    return photos.length ? photos : getImportedRecipePhotos();
  }

  async function saveRecipeDraft() {
    const name = $("#nameInput").value.trim();
    const status = $("#uploadStatus");
    if (!name) {
      status.textContent = t("recipeNameRequired");
      status.classList.add("error");
      $("#nameInput").focus();
      return;
    }

    const button = $("#saveRecipeDraft");
    button.disabled = true;
    status.textContent = t("savingDraft");
    status.classList.remove("error");

    try {
      const draft = {
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...recipePayload(name, await readUploadPhotos()),
        createdAt: new Date().toISOString(),
      };
      prependDraft(draft);
      persistDrafts();
      clearUploadForm();
      setView("recipes");
      render();
      status.textContent = t("draftSaved");
    } catch (error) {
      console.warn(error);
      status.textContent = t("draftSaveError");
      status.classList.add("error");
    } finally {
      button.disabled = false;
    }
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
      const replacementPhotos = await readFilesAsDataUrls(selectedEditPhotoFiles(), 3, {
        maxSide: 700,
        quality: 0.68,
        maxBytes: 420000,
      });

      setRecipeEdit(selectedRecipeId, {
        id: selectedRecipeId,
        name: updateLocalizedText(current.name, name, getLang()),
        category: $("#editCategoryInput").value,
        ingredientsText: updateLocalizedText({
          en: (current.ingredients?.en || []).join("\n"),
          es: (current.ingredients?.es || []).join("\n"),
        }, $("#editIngredientsInput").value.trim(), getLang()),
        stepsText: updateLocalizedText({
          en: (current.steps?.en || []).join("\n"),
          es: (current.steps?.es || []).join("\n"),
        }, $("#editStepsInput").value.trim(), getLang()),
        allergyWarning: updateLocalizedText(current.allergyWarning, $("#editAllergyInput").value.trim(), getLang()),
        notes: updateLocalizedText(current.notes, $("#editNoteInput").value.trim(), getLang()),
        cardPhoto: replacementPhotos[0] || current.cardPhoto || current.photos?.[0] || "assets/recipe-card-placeholder.jpg",
        photos: replacementPhotos.length
          ? replacementPhotos
          : current.photos?.length ? current.photos : [],
        updatedAt: new Date().toISOString(),
      });
      removeDeletedRecipeId(selectedRecipeId);
      setEditMode(false);
      render();
      $("#recipeDetail").hidden = false;
      setDetailStatus(t("recipeUpdated"));
      focusRecipeDetail();
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
    setEditMode(false);
    render();
    $("#recipeDetail").hidden = true;
    const status = $("#sharedStateStatus");
    if (status) status.textContent = t("recipeDeleted");
    await saveSharedState();
    if (status) status.textContent = t("recipeDeleted");
  }

  async function scanRecipePhotos() {
    const files = selectedUploadPhotoFiles();
    if (!files.length) return;

    const status = $("#uploadStatus");
    status.textContent = t("recipeScanWorking");
    status.classList.remove("error");

    try {
      const images = await readFilesAsDataUrls(files, MAX_UPLOAD_PHOTOS, {
        maxSide: 1100,
        quality: 0.74,
        maxBytes: 650000,
      });
      const recipe = await recognizeRecipe(images);
      fillUploadFormFromRecipe(recipe);
      openRecipeDetails();
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
      openRecipeDetails();
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
    const ingredients = $("#ingredientsInput").value.trim();
    const steps = $("#stepsInput").value.trim();
    const status = $("#uploadStatus");
    if (!name) {
      status.textContent = t("recipeNameRequired");
      status.classList.add("error");
      $("#nameInput").focus();
      return;
    }
    if (!ingredients || !steps) {
      status.textContent = t("recipePublishNeedsDetails");
      status.classList.add("error");
      openRecipeDetails();
      if (!ingredients) $("#ingredientsInput").focus();
      else $("#stepsInput").focus();
      return;
    }

    const submitButton = $("#uploadForm .primary-action");
    submitButton.disabled = true;
    status.textContent = t("savingRecipeLive");
    status.classList.remove("error");

    let recipePhotos = [];

    try {
      recipePhotos = await readUploadPhotos();
      const recipe = recipePayload(name, recipePhotos);
      const saved = await saveSharedRecipe(recipe);
      prependSharedRecipe(saved.recipe);
      clearUploadForm();
      status.textContent = t("sharedRecipeSaved");
      setView("recipes");
      render();
    } catch (error) {
      console.warn(error);
      const fallbackDraft = {
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...recipePayload(name, recipePhotos),
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
    $("#usePhotoSource").addEventListener("click", () => setRecipeSourceMode("photos"));
    $("#useUrlSource").addEventListener("click", () => setRecipeSourceMode("url"));
    $("#useManualSource").addEventListener("click", () => setRecipeSourceMode("manual"));

    $("#editRecipe").addEventListener("click", () => {
      const recipe = recipeById(getSelectedRecipeId());
      if (!recipe) return;
      $("#recipeMoreActions").open = false;
      populateEditRecipeForm(recipe);
      setEditMode(true);
      setDetailStatus("");
      focusRecipeEdit();
    });

    $("#cancelRecipeEdit").addEventListener("click", () => {
      setEditMode(false);
      $("#editPhotoInput").value = "";
      $("#editPhotoCameraInput").value = "";
      setDetailStatus("");
      $("#recipeDetail").scrollIntoView({ behavior: "auto", block: "start" });
      $("#editRecipe").focus({ preventScroll: true });
    });

    const previewEditPhotos = () => {
      const files = selectedEditPhotoFiles().slice(0, 3);
      if (!files.length) {
        renderEditPhotoPreview(recipeToEditableUpload(recipeById(getSelectedRecipeId())).photos);
        return;
      }

      renderEditPhotoPreview(files.map((file) => URL.createObjectURL(file)));
    };

    $("#editPhotoInput").addEventListener("change", previewEditPhotos);
    $("#editPhotoCameraInput").addEventListener("change", previewEditPhotos);

    $("#editRecipeForm").addEventListener("submit", submitRecipeEdit);
    $("#deleteRecipe").addEventListener("click", deleteSelectedRecipe);
    $("#photoInput").addEventListener("change", () => appendUploadPhotoFiles($("#photoInput").files));
    $("#photoCameraInput").addEventListener("change", () => appendUploadPhotoFiles($("#photoCameraInput").files));
    $("#scanRecipePhotos").addEventListener("click", scanRecipePhotos);
    $("#clearRecipePhotos").addEventListener("click", clearUploadPhotoFiles);
    $("#importRecipeUrl").addEventListener("click", importRecipeFromUrl);
    $("#saveRecipeDraft").addEventListener("click", saveRecipeDraft);
    $("#uploadForm").addEventListener("submit", submitUploadForm);
    renderUploadPhotoQueue();
  }

  return {
    bind,
    setEditMode,
  };
}
