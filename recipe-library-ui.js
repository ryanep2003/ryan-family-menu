import { allLocalizedText, hasLocalizedContent, isMeaningfulText, localizedTextExact } from "./localized-data.js";
import { linesMatchLanguage, textMatchesLanguage } from "./language-quality.js";
import { cardPhotoFor, cardPhotoIsGenerated, isUsableRecipeLine, servingsForRecipe } from "./recipe-utils.js";
import { appendRecipeToMeal, mealRoles, upcomingMealDateOptions } from "./schedule-utils.js";

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
  let wheelIndex = 0;
  let lastWheelFilterKey = "";
  let wheelPointer = null;
  let suppressWheelClick = false;

  function ensureRecipeWheelStyles() {
    if (globalThis.document?.getElementById("recipeWheelStyles")) return;
    const style = globalThis.document?.createElement("style");
    if (!style) return;
    style.id = "recipeWheelStyles";
    style.textContent = `
      #recipeList.recipe-wheel-list {
        position: relative;
        height: clamp(330px, 78vw, 430px);
        min-height: 330px;
        margin-top: 8px;
        overflow: hidden;
        perspective: 1050px;
        perspective-origin: 50% 44%;
        touch-action: pan-y;
        isolation: isolate;
      }
      #recipeList.recipe-wheel-list::after {
        content: "";
        position: absolute;
        right: 12%;
        bottom: 4px;
        left: 12%;
        height: 34px;
        border-radius: 50%;
        background: rgba(26,58,92,.08);
        filter: blur(12px);
        pointer-events: none;
      }
      #recipeList.recipe-wheel-list > .recipe-browse-card {
        --wheel-x: 0px;
        --wheel-z: 0px;
        --wheel-rotate: 0deg;
        --wheel-scale: 1;
        --wheel-opacity: 1;
        position: absolute;
        top: 8px;
        left: 50%;
        z-index: var(--wheel-z-index, 1);
        width: min(82vw, 360px);
        min-height: 300px;
        margin: 0;
        padding: 12px;
        opacity: var(--wheel-opacity);
        transform: translate3d(calc(-50% + var(--wheel-x)), 0, var(--wheel-z)) rotateY(var(--wheel-rotate)) scale(var(--wheel-scale));
        transform-origin: center center;
        transition: transform 280ms cubic-bezier(.2,.75,.2,1), opacity 220ms ease, filter 220ms ease;
        backface-visibility: hidden;
        will-change: transform, opacity;
        filter: saturate(.78) brightness(.98);
      }
      #recipeList.recipe-wheel-list > .recipe-browse-card.is-wheel-active { filter: none; }
      #recipeList.recipe-wheel-list > .recipe-browse-card .recipe-card {
        grid-template-columns: 1fr;
        align-content: start;
        min-height: 238px;
        gap: 8px;
        padding: 0;
        border: 0;
        background: transparent;
        box-shadow: none;
      }
      #recipeList.recipe-wheel-list > .recipe-browse-card .recipe-card > .recipe-photo-shell {
        grid-row: auto;
        grid-column: 1;
        width: 100%;
        height: 172px;
        border-radius: 16px;
        overflow: hidden;
        background: var(--surface-muted);
      }
      #recipeList.recipe-wheel-list > .recipe-browse-card .recipe-photo-shell img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      #recipeList.recipe-wheel-list > .recipe-browse-card .recipe-card h3,
      #recipeList.recipe-wheel-list > .recipe-browse-card .recipe-card p,
      #recipeList.recipe-wheel-list > .recipe-browse-card .recipe-card .category-pill { grid-column: 1; }
      #recipeList.recipe-wheel-list > .recipe-browse-card .recipe-card h3 { font-size: 1.18rem; }
      #recipeList.recipe-wheel-list > .recipe-browse-card:not(.is-wheel-active) .recipe-add-meal { opacity: .35; }
      #recipeList.recipe-wheel-list:focus-visible {
        outline: 3px solid color-mix(in srgb, var(--blue) 55%, white);
        outline-offset: 3px;
        border-radius: var(--radius-sheet);
      }
      @media (min-width: 760px) {
        #recipeList.recipe-wheel-list { height: 440px; }
        #recipeList.recipe-wheel-list > .recipe-browse-card { width: 380px; }
      }
      @media (prefers-reduced-motion: reduce) {
        #recipeList.recipe-wheel-list {
          display: flex;
          position: static;
          height: auto;
          min-height: 0;
          gap: 12px;
          overflow-x: auto;
          perspective: none;
          scroll-snap-type: x mandatory;
          touch-action: pan-x pan-y;
          padding-bottom: 12px;
        }
        #recipeList.recipe-wheel-list::after { display: none; }
        #recipeList.recipe-wheel-list > .recipe-browse-card {
          position: relative;
          top: auto;
          left: auto;
          flex: 0 0 min(82vw, 360px);
          opacity: 1 !important;
          visibility: visible !important;
          transform: none !important;
          transition: none !important;
          filter: none !important;
          scroll-snap-align: center;
        }
      }
    `;
    globalThis.document.head.append(style);
  }

  function requiredText(value) { return exactText(value) || fallbackText(value) || t("translationPendingShort"); }

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
    if (lines.length && linesMatchLanguage(lines, lang)) return { lines, fallback: false };
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

  function recipeCardMarkup(recipe, index, { pick = false, plannedIds = new Set() } = {}) {
    const name = requiredText(recipe.name);
    const meta = displayText(recipe.meta).text;
    const short = displayText(recipe.short).text;
    const cardPhoto = cardPhotoFor(recipe);
    const hasPhoto = !cardPhotoIsGenerated(recipe) && Boolean(cardPhoto);
    const canHydratePhoto = !hasPhoto && recipe.hasSourcePhotos;
    const pickLabel = pick ? plannedIds.has(recipe.id) ? t("recipePickPlanned") : t("recipePickFavorite") : "";
    const copy = `
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
        ${short && pick ? `<p>${escapeHtml(short)}</p>` : ""}
    `;
    if (pick) {
      return `
      <button class="recipe-card recipe-pick-card${hasPhoto || canHydratePhoto ? " has-media" : " no-media"}" style="--card-order: ${Math.min(index, 8)}" type="button" data-open="${escapeHtml(recipe.id)}">
        ${copy}
      </button>
    `;
    }
    return `
      <article class="recipe-browse-card${hasPhoto || canHydratePhoto ? " has-media" : " no-media"}" style="--card-order: ${Math.min(index, 8)}" data-wheel-index="${index}">
        <button class="recipe-card" type="button" data-open="${escapeHtml(recipe.id)}">
          ${copy}
        </button>
        <button class="soft-action recipe-add-meal" type="button" data-open="${escapeHtml(recipe.id)}">${escapeHtml(t("addRecipeToMeal"))}</button>
      </article>
    `;
  }

  function applyWheelLayout() {
    const list = $("#recipeList");
    if (!list) return;
    const cards = [...list.querySelectorAll(":scope > .recipe-browse-card")];
    if (cards.length < 2) {
      list.classList.remove("recipe-wheel-list");
      list.removeAttribute("tabindex");
      cards.forEach((card) => {
        card.classList.remove("is-wheel-active");
        ["--wheel-x", "--wheel-z", "--wheel-rotate", "--wheel-scale", "--wheel-opacity", "--wheel-z-index", "visibility"].forEach((property) => card.style.removeProperty(property));
        card.removeAttribute("aria-hidden");
        card.querySelectorAll("button").forEach((button) => { button.tabIndex = 0; });
      });
      return;
    }
    ensureRecipeWheelStyles();
    wheelIndex = Math.max(0, Math.min(wheelIndex, cards.length - 1));
    list.classList.add("recipe-wheel-list");
    list.tabIndex = 0;
    const spacing = Math.min(310, Math.max(195, (list.clientWidth || 360) * 0.62));
    cards.forEach((card, index) => {
      const distance = index - wheelIndex;
      const magnitude = Math.abs(distance);
      const visibleDistance = Math.min(magnitude, 3);
      const direction = Math.sign(distance);
      const active = distance === 0;
      card.style.setProperty("--wheel-x", `${direction * visibleDistance * spacing}px`);
      card.style.setProperty("--wheel-z", `${-visibleDistance * 120}px`);
      card.style.setProperty("--wheel-rotate", `${-direction * visibleDistance * 18}deg`);
      card.style.setProperty("--wheel-scale", `${Math.max(.72, 1 - visibleDistance * .1)}`);
      card.style.setProperty("--wheel-opacity", `${magnitude > 3 ? 0 : Math.max(.22, 1 - visibleDistance * .22)}`);
      card.style.setProperty("--wheel-z-index", `${10 - visibleDistance}`);
      card.style.visibility = magnitude > 3 ? "hidden" : "visible";
      card.classList.toggle("is-wheel-active", active);
      card.setAttribute("aria-hidden", `${magnitude > 3}`);
      card.querySelectorAll("button").forEach((button) => { button.tabIndex = active ? 0 : -1; });
      const primary = card.querySelector(".recipe-card");
      if (primary) {
        if (active) primary.setAttribute("aria-current", "true");
        else primary.removeAttribute("aria-current");
      }
    });
  }

  function moveWheel(nextIndex) {
    const list = $("#recipeList");
    const cards = list ? [...list.querySelectorAll(":scope > .recipe-browse-card")] : [];
    if (!cards.length) return;
    wheelIndex = Math.max(0, Math.min(nextIndex, cards.length - 1));
    applyWheelLayout();
  }

  function renderRecipes() {
    const search = getRecipeSearch().trim().toLowerCase();
    const categoryFilter = getCategoryFilter();
    const filterKey = `${search}\u0000${categoryFilter}`;
    if (filterKey !== lastWheelFilterKey) {
      wheelIndex = 0;
      lastWheelFilterKey = filterKey;
    }
    const catalogStatus = getRecipeCatalogStatus();
    const recipes = catalogStatus === "ready" ? allRecipes() : [];
    const filtered = recipes.filter((recipe) => {
      const categoryMatch = categoryFilter === "all" || categoryFor(recipe) === categoryFilter;
      const haystack = [...[recipe.name, recipe.meta, recipe.short, recipe.tags].flatMap(allLocalizedText), categoryLabel(categoryFor(recipe))].join(" ").toLowerCase();
      return categoryMatch && (!search || haystack.includes(search));
    });
    const favoriteIds = new Set(getFavorites());
    const plannedIds = new Set(getPlannedRecipeIds());
    const picks = recipes
      .filter((recipe) => favoriteIds.has(recipe.id) || plannedIds.has(recipe.id))
      .sort((left, right) => Number(plannedIds.has(right.id)) - Number(plannedIds.has(left.id)) || Number(favoriteIds.has(right.id)) - Number(favoriteIds.has(left.id)));

    $("#recipeCount").textContent = catalogStatus === "loading"
      ? t("recipeCatalogLoading")
      : catalogStatus === "unavailable"
        ? t("recipeCatalogUnavailable").replace("{count}", recipes.length)
        : t(filtered.length === recipes.length ? "recipeCount" : "recipeCountFiltered").replace("{count}", filtered.length).replace("{total}", recipes.length);
    $("#recipePicksList").innerHTML = picks.slice(0, 6).map((recipe, index) => recipeCardMarkup(recipe, index, { pick: true, plannedIds })).join("");
    $("#recipePicksEmpty").hidden = picks.length > 0;
    if ($("#recipePicksSection")) $("#recipePicksSection").hidden = Boolean(search) || (catalogStatus === "ready" && recipes.length === 0);
    if ($("#recipeSearch") && globalThis.document?.activeElement !== $("#recipeSearch")) $("#recipeSearch").value = getRecipeSearch();
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
    applyWheelLayout();
    onRecipeMediaRendered();
  }

  function renderLocalizedList(list, emptyNode, lines, emptyKey) {
    if (list) {
      list.innerHTML = lines.length ? lines.map((item) => `<li>${escapeHtml(item)}</li>`).join("") : "";
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
    const contentReady = Boolean(nameDisplay.text && ingredientsDisplay.lines.length && stepsDisplay.lines.length && warningReady);
    const usingFallback = Boolean(nameDisplay.fallback || metaDisplay.fallback || ingredientsDisplay.fallback || stepsDisplay.fallback || (hasWarning && !warningTranslated && warningFallback) || displayText(recipe.notes).fallback);
    const warning = hasWarning ? warningTranslated || warningFallback || t("safetyTranslationPending") : "";
    const actionLockReason = hasWarning && !warningTranslated ? t("safetyActionsLocked") : contentReady ? "" : t("recipeDetailsRequired");
    const translationPending = isRecipeTranslationPending(recipe.id, getLang());
    const showTranslationState = translationPending || !contentReady || usingFallback;
    const actionsLocked = showTranslationState;
    $("#recipeDetail").classList.remove("editing");
    $("#recipeMoreActions").open = false;
    if ($("#recipeOutcomePanel")) $("#recipeOutcomePanel").hidden = true;
    $("#editRecipeForm").hidden = true;
    $("#detailName").textContent = nameDisplay.text || t("translationPendingShort");
    const servings = servingsForRecipe(recipe);
    $("#detailMeta").textContent = [servings ? t("tonightServes").replace("{count}", `${servings}`) : "", metaDisplay.text].filter(Boolean).join(" · ");
    const memory = getRecipeMemory(recipe.id);
    if ($("#detailServings")) { $("#detailServings").textContent = ""; $("#detailServings").hidden = true; }
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
    $("#recipeTranslationStatus").textContent = usingFallback ? translationPending ? t("translatingRecipe") : t("translationFallbackDetail") : contentReady ? "" : t("translationPendingDetail");
    renderLocalizedList($("#ingredientList"), $("#ingredientListEmpty"), ingredientsDisplay.lines, "recipeIngredientsEmpty");
    renderLocalizedList($("#stepList"), $("#stepListEmpty"), stepsDisplay.lines, "recipeStepsEmpty");
    $("#familyNotes").textContent = displayText(recipe.notes).text || (contentReady ? "" : t("translationPendingShort"));
    const photos = Array.isArray(recipe.photos) ? recipe.photos : [];
    $("#photoStrip").innerHTML = photos.map((src, index) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(`${nameDisplay.text || t("translationPendingShort")} ${t("sourcePhoto")} ${index + 1}`)}" loading="lazy" decoding="async" />`).join("");
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
    if ($("#startCooking")) { $("#startCooking").disabled = actionsLocked; $("#startCooking").textContent = t("cookButton"); }
    $("#recipeSafetyLockReason").hidden = !actionLockReason;
    $("#recipeSafetyLockReason").textContent = actionLockReason;
    const addForm = $("#addRecipeToMealForm");
    const addSubmit = $("#addRecipeToMealSubmit");
    if (addForm) { addForm.hidden = actionsLocked; addForm.classList.toggle("is-locked", actionsLocked); addForm.setAttribute("aria-disabled", `${actionsLocked}`); }
    ["#addRecipeToMealDate", "#addRecipeToMealPeriod"].forEach((selector) => { const control = $(selector); if (control) control.disabled = actionsLocked; });
    if (addSubmit) addSubmit.disabled = actionsLocked;
    renderMealDateOptions();
    setDetailStatus("");
  }

  function mealDateLabel(dateKey, offset) {
    if (offset === 0) return t("addRecipeToMealToday");
    if (offset === 1) return t("addRecipeToMealTomorrow");
    const date = new Date(`${dateKey}T12:00:00`);
    return new Intl.DateTimeFormat(getLang() === "es" ? "es-US" : "en-US", { weekday: "short", month: "short", day: "numeric" }).format(date);
  }

  function renderMealDateOptions() {
    const select = $("#addRecipeToMealDate");
    if (!select) return;
    const current = select.value;
    const options = upcomingMealDateOptions(new Date(), 7);
    select.innerHTML = options.map((option) => `<option value="${escapeHtml(option.dateKey)}">${escapeHtml(mealDateLabel(option.dateKey, option.offset))}</option>`).join("");
    select.value = options.some((option) => option.dateKey === current) ? current : options[0]?.dateKey || "";
  }

  function bindOpenButtons() {
    $$("[data-open]").forEach((button) => {
      button.addEventListener("click", (event) => {
        const wheelCard = button.closest?.("#recipeList .recipe-browse-card");
        if (wheelCard && suppressWheelClick) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (wheelCard && !wheelCard.classList.contains("is-wheel-active") && $("#recipeList")?.classList.contains("recipe-wheel-list")) {
          event.preventDefault();
          moveWheel(Number(wheelCard.dataset.wheelIndex || 0));
          $("#recipeList")?.focus({ preventScroll: true });
          return;
        }
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
    ensureRecipeWheelStyles();
    const wheel = $("#recipeList");
    wheel?.addEventListener("keydown", (event) => {
      const count = wheel.querySelectorAll(":scope > .recipe-browse-card").length;
      if (count < 2) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); moveWheel(wheelIndex - 1); }
      else if (event.key === "ArrowRight") { event.preventDefault(); moveWheel(wheelIndex + 1); }
      else if (event.key === "Home") { event.preventDefault(); moveWheel(0); }
      else if (event.key === "End") { event.preventDefault(); moveWheel(count - 1); }
    });
    wheel?.addEventListener("pointerdown", (event) => {
      if (!wheel.classList.contains("recipe-wheel-list")) return;
      wheelPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      wheel.setPointerCapture?.(event.pointerId);
    });
    wheel?.addEventListener("pointerup", (event) => {
      if (!wheelPointer || wheelPointer.id !== event.pointerId) return;
      const dx = event.clientX - wheelPointer.x;
      const dy = event.clientY - wheelPointer.y;
      wheelPointer = null;
      if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      suppressWheelClick = true;
      moveWheel(wheelIndex + (dx < 0 ? 1 : -1));
      globalThis.setTimeout?.(() => { suppressWheelClick = false; }, 0);
    });
    wheel?.addEventListener("pointercancel", () => { wheelPointer = null; });
    globalThis.addEventListener?.("resize", applyWheelLayout, { passive: true });

    $("#closeRecipeDetail").addEventListener("click", () => {
      $("#recipeDetail").hidden = true;
      $("#recipesView").classList.remove("detail-open");
      $("#recipeDetail").classList.remove("editing");
      $("#editRecipeForm").hidden = true;
      clearDirtyForm($("#editRecipeForm"));
      setDetailStatus("");
      if (lastLibraryButton) { lastLibraryButton.focus(); return; }
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

    $("#addRecipeToMealForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const recipe = recipeById(getSelectedRecipeId());
      const dateKey = $("#addRecipeToMealDate")?.value || "";
      const period = $("#addRecipeToMealPeriod")?.value || "dinner";
      const status = $("#addRecipeToMealStatus");
      if (!recipe || !dateKey) return;
      const category = categoryFor(recipe);
      const role = mealRoles.some((item) => item.key === category) ? category : "other";
      const nextMeal = appendRecipeToMeal(calendarMealForDateKey(dateKey), { recipeId: recipe.id, period, role });
      setCalendarMeals({ ...getCalendarMeals(), [dateKey]: nextMeal });
      if (status) status.textContent = "";
      render();
      const saved = await saveSchedule();
      if (status) {
        status.textContent = saved === false
          ? t("addRecipeToMealFailed")
          : t("addRecipeToMealSaved").replace("{meal}", t(`${period}Slot`)).replace("{date}", mealDateLabel(dateKey, upcomingMealDateOptions(new Date(), 7).find((option) => option.dateKey === dateKey)?.offset));
      }
    });
  }

  return { bindLibraryControls, bindOpenButtons, renderDetail, renderRecipes };
}
