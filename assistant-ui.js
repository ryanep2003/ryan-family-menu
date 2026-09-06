import {
  ASSISTANT_ACTIONS,
  applyDinnerAssignments,
  assistantPreviewNeedsConfirm,
  classifyAskIntent,
  dateKeysForAction,
  lookupDinner,
  proposeDinnerFill,
  proposeShoppingRefresh,
  relativeDinnerDateKey,
  shoppingRefreshFingerprint,
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
  let shoppingDateDraft = null;
  let askedQuestion = "";

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
    renderPreview();
  }

  function updateApplyState() {
    const apply = $("#assistantApply");
    if (!apply) return;
    const canApply = assistantPreviewNeedsConfirm(preview) && !applying;
    apply.hidden = !canApply;
    apply.disabled = !canApply;
    apply.textContent = preview?.kind === "shopping" ? t("assistantConfirmShopping") : t("assistantApply");
  }

  function groceryName(item) {
    return localize(item?.text) || item?.ingredientKey || "";
  }

  function groceryUses(item) {
    const uses = Array.isArray(item?.mealUses) ? item.mealUses : [];
    const labels = [...new Map(uses.map((use) => [
      `${use.dateKey}:${use.mealSlot}:${use.recipeId || ""}`,
      `${formatDayLabel(use.dateKey)} · ${use.mealSlot ? t(`${use.mealSlot}Slot`) : ""}`.trim(),
    ])).values()];
    return labels.join(", ");
  }

  function makeShoppingPreview(dateKeys) {
    const generatedItems = generateGroceriesForDates(dateKeys);
    const existingItems = getGroceries();
    const proposedItems = applyInventoryCoverage(
      shoppingListAfterRefresh({ generatedItems, existingItems }),
      getInventory(),
    );
    return {
      ...proposeShoppingRefresh({ generatedItems, existingItems, proposedItems }),
      dateKeys: [...dateKeys],
    };
  }

  function dateKeysForShoppingWindow(dateWindow, current = now()) {
    if (dateWindow === "today" || dateWindow === "tomorrow") {
      return [relativeDinnerDateKey(dateWindow, current)];
    }
    return dateKeysForAction("refresh-shopping", current);
  }

  function shoppingDateOptions(dateKeys) {
    return dateKeys.map((dateKey) => {
      const items = generateGroceriesForDates([dateKey]);
      return {
        dateKey,
        itemCount: items.length,
        uses: [...new Set(items.flatMap((item) => groceryUses(item).split(", ").filter(Boolean)))],
      };
    }).filter((option) => option.itemCount > 0);
  }

  function startShoppingDateChoice({ dateKeys = dateKeysForShoppingWindow(), selectedDateKeys = [] } = {}) {
    const dateOptions = shoppingDateOptions(dateKeys);
    const availableKeys = new Set(dateOptions.map((option) => option.dateKey));
    shoppingDateDraft = {
      dateOptions,
      selectedDateKeys: [...new Set(selectedDateKeys)].filter((dateKey) => availableKeys.has(dateKey)),
    };
    preview = { kind: "shopping-dates" };
    activeAction = "";
    setStatus("");
    renderChips();
    renderPreview();
  }

  function renderRequestContext() {
    if (!askedQuestion) return "";
    return `<p class="assistant-request-context">${escapeHtml(t("assistantRequestContext").replace("{question}", askedQuestion))}</p>`;
  }

  function previewQuantity(item) {
    const quantities = item?.remainingQuantities && Object.keys(item.remainingQuantities).length
      ? item.remainingQuantities
      : item?.plannedQuantities;
    const lang = getLang();
    const rawQuantity = quantities?.[lang] ?? quantities?.en ?? quantities?.es;
    const quantity = Number(rawQuantity);
    if (!Number.isFinite(quantity)) return "";
    const unit = item?.plannedUnits?.[lang] ?? item?.plannedUnits?.en ?? item?.plannedUnits?.es ?? "";
    return unit ? `${quantity} ${unit}` : `${quantity}`;
  }

  function shoppingChangeDetails({ before, after }) {
    const details = [];
    const beforeQuantity = previewQuantity(before);
    const afterQuantity = previewQuantity(after);
    if (beforeQuantity !== afterQuantity && (beforeQuantity || afterQuantity)) {
      details.push(t("assistantShoppingQuantityChanged").replace("{before}", beforeQuantity || "—").replace("{after}", afterQuantity || "—"));
    }
    if (Boolean(before?.checked) !== Boolean(after?.checked)) {
      details.push(t(after?.checked ? "assistantShoppingMarkedBought" : "assistantShoppingMarkedUnbought"));
    }
    if (Boolean(before?.inInventory) !== Boolean(after?.inInventory)
      || (before?.inventoryDecision || "") !== (after?.inventoryDecision || "")) {
      details.push(t(after?.inInventory ? "assistantShoppingCoveredAtHome" : "assistantShoppingNeedsReview"));
    }
    if (groceryName(before) !== groceryName(after) && !details.length) details.push(t("assistantShoppingItemChanged"));
    return details.join(" · ");
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

    if (preview.kind === "shopping-clarification") {
      panel.innerHTML = `
        <h3>${escapeHtml(t("assistantShoppingClarifyHeading"))}</h3>
        ${renderRequestContext()}
        <p>${escapeHtml(t("assistantShoppingClarify"))}</p>
        <div class="assistant-lookup-actions">
          <button type="button" class="assistant-secondary" data-assistant-shopping-choice="edit"${applying ? " disabled" : ""}>${escapeHtml(t("assistantShoppingEditItems"))}</button>
          <button type="button" class="assistant-secondary" data-assistant-shopping-choice="dates"${applying ? " disabled" : ""}>${escapeHtml(t("assistantShoppingChooseDates"))}</button>
        </div>
      `;
      updateApplyState();
      return;
    }

    if (preview.kind === "shopping-negated" || preview.kind === "shopping-unsupported") {
      const key = preview.kind === "shopping-negated" ? "assistantShoppingNegated" : "assistantShoppingUnsupported";
      panel.innerHTML = `
        <h3>${escapeHtml(t("assistantShoppingClarifyHeading"))}</h3>
        ${renderRequestContext()}
        <p>${escapeHtml(t(key))}</p>
        <div class="assistant-lookup-actions">
          <button type="button" class="assistant-secondary" data-assistant-shopping-choice="edit"${applying ? " disabled" : ""}>${escapeHtml(t("assistantShoppingEditItems"))}</button>
        </div>
      `;
      updateApplyState();
      return;
    }

    if (preview.kind === "shopping-dates") {
      const options = shoppingDateDraft?.dateOptions || [];
      const selectedDateKeys = shoppingDateDraft?.selectedDateKeys || [];
      panel.innerHTML = `
        <h3>${escapeHtml(t("assistantShoppingDatesHeading"))}</h3>
        ${renderRequestContext()}
        <p>${escapeHtml(options.length ? t("assistantShoppingDatesPrompt") : t("assistantShoppingDatesEmpty"))}</p>
        ${options.length ? `<div class="assistant-date-options">${options.map((option) => `
          <label><input type="checkbox" data-assistant-shopping-date="${escapeHtml(option.dateKey)}"${selectedDateKeys.includes(option.dateKey) ? " checked" : ""}${applying ? " disabled" : ""}>
            <span><strong>${escapeHtml(formatDayLabel(option.dateKey))}</strong>${option.uses.length ? `<small>${escapeHtml(option.uses.join(", "))}</small>` : ""}</span>
          </label>
        `).join("")}</div>
        <div class="assistant-lookup-actions"><button type="button" class="assistant-apply" data-assistant-shopping-preview${selectedDateKeys.length && !applying ? "" : " disabled"}>${escapeHtml(t("assistantShoppingPreviewChanges"))}</button></div>` : ""}
      `;
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
      const renderChange = (item, label, detail = "") => `<li><strong>${escapeHtml(label)}</strong><span>${escapeHtml(groceryName(item))}</span>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}${groceryUses(item) ? `<small>${escapeHtml(groceryUses(item))}</small>` : ""}</li>`;
      const changes = preview.changes;
      const changeRows = [
        ...changes.added.map((item) => renderChange(item, t("assistantShoppingAdded"))),
        ...changes.removed.map((item) => renderChange(item, t("assistantShoppingRemoved"))),
        ...changes.changed.map((change) => renderChange(change.after, t("assistantShoppingChanged"), shoppingChangeDetails(change))),
      ].join("");
      panel.innerHTML = `
        <h3>${escapeHtml(t("assistantShoppingPreviewHeading"))}</h3>
        ${renderRequestContext()}
        <p>${escapeHtml(t("assistantShoppingPreview")
          .replace("{count}", `${preview.generatedCount}`)
          .replace("{listCount}", `${preview.listCount}`))}</p>
        <p>${escapeHtml(t("assistantShoppingDatesIncluded").replace("{dates}", preview.dateKeys.map(formatDayLabel).join(", ")))}</p>
        ${changeRows ? `<ul class="assistant-preview-list">${changeRows}</ul>` : `<p>${escapeHtml(t("assistantShoppingNoChange"))}</p>`}
        ${preview.retainedManualCount ? `<p>${escapeHtml(t("assistantShoppingManualPreserved").replace("{count}", `${preview.retainedManualCount}`))}</p>` : ""}
        <div class="assistant-lookup-actions"><button type="button" class="assistant-secondary" data-assistant-shopping-edit-dates${applying ? " disabled" : ""}>${escapeHtml(t("assistantShoppingEditDates"))}</button></div>
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

  function previewAction(action, { dateWindow = "", keepQuestion = false } = {}) {
    if (!keepQuestion) askedQuestion = "";
    shoppingDateDraft = null;
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
      const dateKeys = dateKeysForShoppingWindow(dateWindow, current);
      shoppingDateDraft = {
        dateOptions: shoppingDateOptions(dateKeys),
        selectedDateKeys: [...dateKeys],
      };
      preview = makeShoppingPreview(dateKeys);
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
    shoppingDateDraft = null;
    askedQuestion = "";
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
    shoppingDateDraft = null;
    askedQuestion = "";
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
        const refreshed = makeShoppingPreview(preview.dateKeys);
        if (refreshed.inputFingerprint !== preview.inputFingerprint || refreshed.fingerprint !== preview.fingerprint) {
          preview = refreshed;
          setStatus(t("assistantPreviewStale"), true);
          setApplying(false);
          renderPreview();
          return false;
        }
        setGroceries(preview.proposedItems);
        render();
        const saved = await saveGroceries();
        if (saved === false) {
          const currentFingerprint = shoppingRefreshFingerprint(getGroceries());
          if (currentFingerprint === preview.fingerprint) {
            preview = { ...preview, inputFingerprint: currentFingerprint };
          }
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
    askedQuestion = asked.trim();
    shoppingDateDraft = null;
    const intent = classifyAskIntent(asked);
    if (intent.kind !== "action") {
      activeAction = "";
      preview = { kind: intent.kind === "unmatched" ? "ask-unmatched" : intent.kind };
      renderChips();
      renderPreview();
      setStatus(intent.kind === "unmatched" ? t("assistantAskUnmatched") : "");
      return;
    }
    previewAction(intent.action, { dateWindow: intent.dateWindow, keepQuestion: true });
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
      const shoppingChoice = event.target.closest?.("[data-assistant-shopping-choice]");
      if (shoppingChoice && isOpen()) {
        event.preventDefault();
        if (applying || shoppingChoice.disabled) return;
        if (shoppingChoice.dataset.assistantShoppingChoice === "edit") {
          closeSheet();
          setView("grocery");
          return;
        }
        startShoppingDateChoice();
        return;
      }
      const previewShopping = event.target.closest?.("[data-assistant-shopping-preview]");
      if (previewShopping && isOpen() && !previewShopping.disabled && shoppingDateDraft?.selectedDateKeys.length) {
        event.preventDefault();
        if (applying) return;
        preview = makeShoppingPreview([...shoppingDateDraft.selectedDateKeys].sort());
        activeAction = "";
        setStatus("");
        renderChips();
        renderPreview();
        return;
      }
      const editShoppingDates = event.target.closest?.("[data-assistant-shopping-edit-dates]");
      if (editShoppingDates && isOpen()) {
        event.preventDefault();
        if (applying || editShoppingDates.disabled) return;
        startShoppingDateChoice({
          dateKeys: shoppingDateDraft?.dateOptions?.map((option) => option.dateKey) || preview?.dateKeys || [],
          selectedDateKeys: shoppingDateDraft?.selectedDateKeys || preview?.dateKeys || [],
        });
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

    $("#assistantAskInput")?.addEventListener("input", () => {
      if (applying) return;
      askedQuestion = $("#assistantAskInput")?.value.trim() || "";
      if (!preview && !shoppingDateDraft) return;
      preview = null;
      shoppingDateDraft = null;
      activeAction = "";
      setStatus("");
      renderChips();
      renderPreview();
    });

    documentObject?.addEventListener("change", (event) => {
      const input = event.target.closest?.("[data-assistant-shopping-date]");
      if (!input || applying || input.disabled || !isOpen() || preview?.kind !== "shopping-dates" || !shoppingDateDraft) return;
      const selected = new Set(shoppingDateDraft.selectedDateKeys);
      if (input.checked) selected.add(input.dataset.assistantShoppingDate);
      else selected.delete(input.dataset.assistantShoppingDate);
      shoppingDateDraft = { ...shoppingDateDraft, selectedDateKeys: [...selected].sort() };
      renderPreview();
      documentObject?.querySelector?.(`[data-assistant-shopping-date="${input.dataset.assistantShoppingDate}"]`)?.focus?.();
    });

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
