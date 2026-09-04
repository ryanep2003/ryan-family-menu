import {
  ASSISTANT_ACTIONS,
  applyDinnerAssignments,
  assistantPreviewNeedsConfirm,
  dateKeysForAction,
  lookupDinner,
  matchAskAction,
  proposeDinnerFill,
  proposeShoppingRefresh,
  relativeDinnerDateKey,
  shoppingListAfterRefresh,
} from "./assistant-logic.js";

const ACTION_LABELS = {
  "plan-next-week": "assistantPlanNextWeek",
  "fill-gaps": "assistantFillGaps",
  "refresh-shopping": "assistantBuildShopping",
  "dinner-today": "assistantDinnerToday",
  "dinner-tomorrow": "assistantDinnerTomorrow",
};

const SOURCE_LABELS = {
  favorite: "assistantSourceFavorite",
  "recent-win": "assistantSourceRecentWin",
  library: "assistantSourceLibrary",
};

export function createAssistantUi({
  $,
  $$,
  t,
  escapeHtml,
  localize,
  getLang = () => "en",
  formatDateKey,
  getMealForDate,
  getRecipes = () => [],
  getFavorites = () => [],
  getDinnerEvents = () => [],
  getFamilyMembers = () => [],
  getFamilyPreferences = () => [],
  getFamilyRules = () => ({}),
  getRecipeFeedback = () => ({}),
  getGroceries = () => [],
  generateGroceriesForDates = () => [],
  applyInventoryCoverage = (items) => items,
  getInventory = () => [],
  recipeById = () => null,
  now = () => new Date(),
  saveSchedule = async () => true,
  saveGroceries = async () => true,
  setCalendarMeals = () => {},
  setGroceries = () => {},
  getCalendarMeals = () => ({}),
  render = () => {},
  setView = () => {},
  openFocusedDinner = () => {},
  startCook = () => {},
  recordActivity = () => {},
  documentObject = globalThis.document,
} = {}) {
  let preview = null;
  let activeAction = "";
  let lastOpener = null;
  let applying = false;

  function sheet() {
    return $("#assistantSheet");
  }

  function isOpen() {
    return sheet() && !sheet().hidden;
  }

  function formatDayLabel(dateKey) {
    const date = new Date(`${dateKey}T12:00:00`);
    if (Number.isNaN(date.getTime())) return dateKey;
    return new Intl.DateTimeFormat(getLang() === "es" ? "es" : "en", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(date);
  }

  function recipeName(recipeId) {
    const recipe = recipeById(recipeId) || getRecipes().find((item) => item.id === recipeId);
    return recipe ? localize(recipe.name) : recipeId;
  }

  function setStatus(message = "", isError = false) {
    const status = $("#assistantStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("error", isError);
  }

  function setBusyControls(isBusy) {
    const panel = sheet();
    panel?.classList?.toggle("is-applying", isBusy);
    panel?.setAttribute?.("aria-busy", isBusy ? "true" : "false");
    const statusRow = $("#assistantStatusRow");
    statusRow?.classList?.toggle("is-busy", isBusy);
    statusRow?.setAttribute?.("aria-busy", isBusy ? "true" : "false");
    const status = $("#assistantStatus");
    status?.setAttribute?.("aria-busy", isBusy ? "true" : "false");
    const spinner = $("#assistantSpinner");
    if (spinner) {
      spinner.hidden = !isBusy;
      spinner.setAttribute("aria-hidden", isBusy ? "false" : "true");
    }
    const askInput = $("#assistantAskInput");
    if (askInput) askInput.disabled = isBusy;
    const askSubmit = $("#assistantAskSubmit");
    if (askSubmit) askSubmit.disabled = isBusy;
    const chips = $("#assistantChips");
    chips?.setAttribute?.("aria-disabled", isBusy ? "true" : "false");
  }

  function setApplying(isApplying) {
    applying = isApplying;
    setBusyControls(isApplying);
    renderChips();
    updateApplyState();
  }

  function updateApplyState() {
    const apply = $("#assistantApply");
    if (!apply) return;
    const canApply = assistantPreviewNeedsConfirm(preview) && !applying;
    apply.hidden = !preview || preview.kind === "dinner-lookup" || preview.kind === "ask-unmatched";
    apply.disabled = !canApply;
  }

  function renderChips() {
    const list = $("#assistantChips");
    if (!list) return;
    list.innerHTML = ASSISTANT_ACTIONS.map((action) => `
      <button type="button" class="assistant-chip${activeAction === action ? " is-selected" : ""}" data-assistant-action="${escapeHtml(action)}" aria-pressed="${activeAction === action}"${applying ? " disabled" : ""}>
        ${escapeHtml(t(ACTION_LABELS[action]))}
      </button>
    `).join("");
  }

  function renderLookupActions(previewState) {
    const main = previewState.items.find((item) => item.role === "main") || previewState.items[0];
    if (previewState.empty || !main) return "";
    return `<div class="assistant-lookup-actions">
      <button type="button" class="assistant-secondary" data-assistant-open-meal="${escapeHtml(previewState.dateKey)}">${escapeHtml(t("assistantOpenMeal"))}</button>
      <button type="button" class="assistant-apply" data-assistant-cook="${escapeHtml(main.recipeId)}">${escapeHtml(t("assistantStartCook"))}</button>
    </div>`;
  }

  function renderPreview() {
    const panel = $("#assistantPreview");
    if (!panel) return;
    if (!preview) {
      panel.innerHTML = `<p class="assistant-preview-empty">${escapeHtml(t("assistantPreviewEmpty"))}</p>`;
      updateApplyState();
      return;
    }

    if (preview.kind === "ask-unmatched") {
      panel.innerHTML = `<p>${escapeHtml(t("assistantAskUnmatched"))}</p>`;
      updateApplyState();
      return;
    }

    if (preview.kind === "dinner-lookup") {
      const heading = preview.when === "today" ? t("assistantDinnerTodayHeading") : t("assistantDinnerTomorrowHeading");
      if (preview.empty) {
        panel.innerHTML = `
          <h3>${escapeHtml(heading)}</h3>
          <p>${escapeHtml(t("assistantDinnerEmpty").replace("{date}", formatDayLabel(preview.dateKey)))}</p>
        `;
      } else {
        const names = preview.items.map((item) => escapeHtml(recipeName(item.recipeId))).join(", ");
        panel.innerHTML = `
          <h3>${escapeHtml(heading)}</h3>
          <p>${escapeHtml(t("assistantDinnerPlanned").replace("{date}", formatDayLabel(preview.dateKey)).replace("{recipes}", names))}</p>
          ${renderLookupActions(preview)}
        `;
      }
      updateApplyState();
      return;
    }

    if (preview.kind === "shopping") {
      panel.innerHTML = `
        <h3>${escapeHtml(t("assistantShoppingPreviewHeading"))}</h3>
        <p>${escapeHtml(t("assistantShoppingPreview")
          .replace("{count}", `${preview.generatedCount}`)
          .replace("{listCount}", `${preview.listCount}`))}</p>
        ${preview.generatedCount ? "" : `<p>${escapeHtml(t("assistantShoppingEmpty"))}</p>`}
      `;
      updateApplyState();
      return;
    }

    const rows = preview.assignments.map((assignment) => `
      <li>
        <strong>${escapeHtml(formatDayLabel(assignment.dateKey))}</strong>
        <span>${escapeHtml(recipeName(assignment.recipeId))}</span>
        <small>${escapeHtml(t(SOURCE_LABELS[assignment.source] || SOURCE_LABELS.library))}</small>
      </li>
    `).join("");
    const occupiedNote = preview.occupied.length
      ? `<p>${escapeHtml(t("assistantFillOccupiedNote").replace("{count}", `${preview.occupied.length}`))}</p>`
      : "";
    const emptyNote = preview.assignments.length
      ? ""
      : `<p>${escapeHtml(preview.unfilled.some((item) => item.reason === "no-recipes") ? t("assistantNoRecipes") : t("assistantNoEmptyDinners"))}</p>`;
    panel.innerHTML = `
      <h3>${escapeHtml(t(preview.action === "fill-gaps" ? "assistantFillGapsPreviewHeading" : "assistantFillPreviewHeading"))}</h3>
      ${preview.assignments.length ? `<ul class="assistant-preview-list">${rows}</ul>` : emptyNote}
      ${occupiedNote}
    `;
    updateApplyState();
  }

  function memoryContext() {
    return {
      recipes: getRecipes(),
      favorites: getFavorites(),
      events: getDinnerEvents(),
      members: getFamilyMembers(),
      preferences: getFamilyPreferences(),
      rules: getFamilyRules(),
      recipeFeedback: getRecipeFeedback(),
      mealForDate: getMealForDate,
    };
  }

  function previewAction(action) {
    activeAction = action;
    setStatus("");
    const current = now();
    if (action === "dinner-today" || action === "dinner-tomorrow") {
      const which = action === "dinner-tomorrow" ? "tomorrow" : "today";
      const dateKey = relativeDinnerDateKey(which, current);
      preview = lookupDinner({
        dateKey,
        meal: getMealForDate(dateKey),
        todayKey: formatDateKey(current),
        when: which,
      });
    } else if (action === "refresh-shopping") {
      const dateKeys = dateKeysForAction("refresh-shopping", current);
      const generatedItems = generateGroceriesForDates(dateKeys);
      preview = proposeShoppingRefresh({
        generatedItems,
        existingItems: getGroceries(),
      });
    } else {
      preview = proposeDinnerFill({
        action,
        now: current,
        ...memoryContext(),
      });
    }
    renderChips();
    renderPreview();
  }

  function restoreFocus() {
    lastOpener?.focus?.();
  }

  function closeSheet() {
    const panel = sheet();
    if (!panel) return;
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
    documentObject?.body?.classList?.remove("assistant-open");
    preview = null;
    activeAction = "";
    setApplying(false);
    setStatus("");
    const ask = $("#assistantAskInput");
    if (ask) ask.value = "";
    renderChips();
    renderPreview();
    restoreFocus();
  }

  function openSheet(source = "today", opener = null) {
    const panel = sheet();
    if (!panel) return;
    lastOpener = opener || documentObject?.activeElement;
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    documentObject?.body?.classList?.add("assistant-open");
    preview = null;
    activeAction = "";
    setApplying(false);
    setStatus("");
    renderChips();
    renderPreview();
    const title = $("#assistantSheetTitle");
    if (title) title.textContent = t(source === "plan" ? "assistantHelpPlan" : "assistantHelp");
    $("#assistantClose")?.focus?.();
  }

  async function applyPreview() {
    if (!assistantPreviewNeedsConfirm(preview) || applying) return false;
    setApplying(true);
    setStatus(t("assistantApplying"));
    try {
      if (preview.kind === "fill-dinners") {
        const result = applyDinnerAssignments({
          calendarMeals: getCalendarMeals(),
          assignments: preview.assignments,
          mealForDate: getMealForDate,
        });
        if (!result.applied.length) {
          setStatus(t("assistantNothingToApply"), true);
          setApplying(false);
          return false;
        }
        setCalendarMeals(result.calendarMeals);
        render();
        const saved = await saveSchedule();
        if (saved === false) {
          setStatus(t("assistantApplyError"), true);
          setApplying(false);
          return false;
        }
        recordActivity("meal", t("assistantAppliedPlan"));
        setStatus(t("assistantAppliedPlan"));
        setApplying(false);
        closeSheet();
        return true;
      }

      if (preview.kind === "shopping") {
        const dateKeys = dateKeysForAction("refresh-shopping", now());
        const generatedItems = generateGroceriesForDates(dateKeys);
        const nextItems = applyInventoryCoverage(
          shoppingListAfterRefresh({
            generatedItems,
            existingItems: getGroceries(),
          }),
          getInventory(),
        );
        setGroceries(nextItems);
        render();
        const saved = await saveGroceries();
        if (saved === false) {
          setStatus(t("assistantApplyError"), true);
          setApplying(false);
          return false;
        }
        recordActivity("grocery", t("assistantAppliedShopping"));
        setStatus(t("assistantAppliedShopping"));
        setApplying(false);
        closeSheet();
        return true;
      }
    } catch {
      setStatus(t("assistantApplyError"), true);
      setApplying(false);
      return false;
    }
    setApplying(false);
    return false;
  }

  function handleAsk(event) {
    event.preventDefault();
    if (applying) return;
    const asked = $("#assistantAskInput")?.value || "";
    const action = matchAskAction(asked);
    if (!action) {
      activeAction = "";
      preview = { kind: "ask-unmatched" };
      renderChips();
      renderPreview();
      setStatus(t("assistantAskUnmatched"));
      return;
    }
    previewAction(action);
  }

  function bindAssistantControls() {
    documentObject?.addEventListener("click", (event) => {
      const opener = event.target.closest?.("[data-open-assistant]");
      if (opener) {
        event.preventDefault();
        openSheet(opener.dataset.openAssistant, opener);
        return;
      }
      const action = event.target.closest?.("[data-assistant-action]");
      if (action && isOpen()) {
        event.preventDefault();
        if (applying) return;
        previewAction(action.dataset.assistantAction);
        return;
      }
      const openMeal = event.target.closest?.("[data-assistant-open-meal]");
      if (openMeal) {
        event.preventDefault();
        const dateKey = openMeal.dataset.assistantOpenMeal;
        closeSheet();
        setView("schedule");
        openFocusedDinner(dateKey);
        return;
      }
      const cook = event.target.closest?.("[data-assistant-cook]");
      if (cook) {
        event.preventDefault();
        const recipe = recipeById(cook.dataset.assistantCook);
        closeSheet();
        if (recipe) startCook(recipe);
        return;
      }
      if (event.target.closest?.("[data-assistant-close]")) {
        event.preventDefault();
        closeSheet();
      }
    });

    $("#assistantApply")?.addEventListener("click", async (event) => {
      event.preventDefault();
      await applyPreview();
    });

    $("#assistantAskForm")?.addEventListener("submit", handleAsk);

    documentObject?.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) {
        event.preventDefault();
        closeSheet();
      }
    });
  }

  return {
    bindAssistantControls,
    openSheet,
    closeSheet,
    previewAction,
    applyPreview,
    getPreview: () => preview,
    isApplying: () => applying,
    isOpen,
  };
}
