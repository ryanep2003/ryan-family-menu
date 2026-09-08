import {
  ASSISTANT_ACTIONS,
  applyDinnerAssignments,
  assistantPreviewNeedsConfirm,
  dateKeysForAction,
  lookupDinner,
  proposeDinnerFill,
  proposeShoppingRefresh,
  relativeDinnerDateKey,
  shoppingRefreshFingerprint,
  shoppingListAfterRefresh,
} from "./assistant-logic.js";
import {
  boundedConversationHistory,
  buildAssistantContext,
  normalizeAssistantReply,
} from "./assistant-conversation.js";
import { recommendationForRecipe } from "./memory-logic.js";

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
const MAX_PENDING_PROPOSALS = 8;

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
  getAvailableFood = () => [],
  getSchoolLunches = () => ({}),
  getReceipts = () => [],
  getBudget = () => ({}),
  getSavedLists = () => [],
  getDisplayedDateKeys = () => [],
  recipeById = () => null,
  createGroceryItem = null,
  createInventoryItem = null,
  now = () => new Date(),
  saveSchedule = async () => true,
  saveGroceries = async () => true,
  saveInventory = async () => true,
  setCalendarMeals = () => {},
  setGroceries = () => {},
  setInventory = () => {},
  getCalendarMeals = () => ({}),
  render = () => {},
  setView = () => {},
  openFocusedDinner = () => {},
  openRecipe = () => {},
  openInventory = () => {},
  openLunches = () => {},
  openBudget = () => {},
  openFamily = () => {},
  askAssistant = async () => { throw new Error("unavailable"); },
  getHouseholdScope = () => "",
  startCook = () => {},
  recordActivity = () => {},
  documentObject = globalThis.document,
} = {}) {
  let preview = null;
  let activeAction = "";
  let lastOpener = null;
  let applying = false;
  let answering = false;
  let shoppingDateDraft = null;
  let askedQuestion = "";
  let conversation = [];
  let requestGeneration = 0;
  let activeRequestController = null;
  const consumedProposalIds = new Set();
  const pendingProposals = new Map();
  let conversationMessageSequence = 0;

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

  function setAnswering(isAnswering) {
    answering = isAnswering;
    setBusyControls(isAnswering || applying);
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

  function sourceLabel(source) {
    return t(`assistantSource${source.type[0].toUpperCase()}${source.type.slice(1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())}`);
  }

  function actionLabel(action) {
    const labels = {
      "open_meal": "assistantActionOpenMeal",
      "open_recipe": "assistantActionOpenRecipe",
      "open_shop": "assistantActionOpenShop",
      "open_inventory": "assistantActionOpenInventory",
      "open_lunches": "assistantActionOpenLunches",
      "open_budget": "assistantActionOpenBudget",
      "fill_gaps": "assistantActionFillGaps",
      "refresh_shopping": "assistantActionRefreshShopping",
      "add_grocery": "assistantActionReviewGrocery",
      "edit_grocery": "assistantActionReviewGrocery",
      "change_meal": "assistantActionReviewMeal",
      "add_inventory": "assistantActionReviewInventory",
      "update_inventory": "assistantActionReviewInventory",
      "update_leftovers": "assistantActionReviewLeftovers",
    };
    return labels[action?.type] ? t(labels[action.type]) : "";
  }

  function proposalFingerprint(action) {
    const args = action?.args || {};
    if (action?.type === "edit_grocery") return JSON.stringify(getGroceries().find((item) => `grocery:${item.id}` === action.sourceId) || null);
    if (action?.type === "update_inventory") return JSON.stringify(getInventory().find((item) => `inventory:${item.id}` === action.sourceId) || null);
    if (action?.type === "change_meal") return JSON.stringify({
      target: getMealForDate(args.dateKey) || null,
      recipe: recipeById(args.recipeSourceId?.slice(7)) || null,
      members: getFamilyMembers(),
      preferences: getFamilyPreferences(),
      rules: getFamilyRules(),
    });
    if (action?.type === "update_leftovers") return JSON.stringify(getMealForDate(args.dateKey) || null);
    return "";
  }

  function itemName(item) {
    return item?.recipeId ? recipeName(item.recipeId) : groceryName(item) || localize(item?.text) || "";
  }

  function periodLabel(period) {
    return t({ breakfast: "breakfastSlot", lunch: "lunchSlot", dinner: "dinnerSlot" }[period] || "dinnerSlot");
  }

  function stockLabel(stockState) {
    return stockState ? t({ full: "stockFull", some: "stockSome", low: "stockLow", out: "stockOut" }[stockState] || "stockSome") : "";
  }

  function locationLabel(location) {
    return t({ pantry: "locationPantry", fridge: "locationFridge", freezer: "locationFreezer", household: "locationHousehold" }[location] || "locationPantry");
  }

  function proposalDetails(action) {
    const args = action?.args || {};
    if (action.type === "edit_grocery") {
      const item = getGroceries().find((entry) => `grocery:${entry.id}` === action.sourceId);
      if (!item) return null;
      return { before: `${itemName(item)} · ${item.checked ? t("assistantShoppingMarkedBought") : t("assistantShoppingMarkedUnbought")}`, after: `${args.text || itemName(item)} · ${typeof args.checked === "boolean" ? (args.checked ? t("assistantShoppingMarkedBought") : t("assistantShoppingMarkedUnbought")) : (item.checked ? t("assistantShoppingMarkedBought") : t("assistantShoppingMarkedUnbought"))}` };
    }
    if (action.type === "update_inventory") {
      const item = getInventory().find((entry) => `inventory:${entry.id}` === action.sourceId);
      if (!item) return null;
      return { before: `${itemName(item)} · ${stockLabel(item.stockState)} · ${item.amount ?? ""}`, after: `${itemName(item)} · ${stockLabel(args.stockState || item.stockState)} · ${args.amount ?? item.amount ?? ""}` };
    }
    if (action.type === "change_meal") {
      const target = getMealForDate(args.dateKey);
      const targetNames = target.items.filter((item) => item.period === args.period).map(itemName);
      const recipe = recipeName(args.recipeSourceId.slice(7));
      return { before: `${formatDayLabel(args.dateKey)}: ${targetNames.join(", ") || "—"}`, after: `${formatDayLabel(args.dateKey)}: ${args.mode === "replace" ? recipe : [...targetNames, recipe].join(", ")}${args.servings !== undefined ? ` · ${args.servings}` : ""}` };
    }
    if (action.type === "update_leftovers") {
      const meal = getMealForDate(args.dateKey);
      const item = meal.items.find((entry) => entry.recipeId === args.recipeSourceId.slice(7) && entry.period === "dinner");
      if (!item) return null;
      return { before: `${recipeName(item.recipeId)} · ${meal.servingPlans?.dinner?.actualLeftovers?.[item.id] || 0}`, after: `${recipeName(item.recipeId)} · ${args.servings}` };
    }
    if (action.type === "add_grocery") return { before: "—", after: [args.text, args.store].filter(Boolean).join(" · ") };
    if (action.type === "add_inventory") return { before: "—", after: [args.text, args.amount !== undefined ? `${args.amount} ${args.unit || ""}`.trim() : "", locationLabel(args.location || "pantry"), stockLabel(args.stockState || "some")].filter(Boolean).join(" · ") };
    return { before: "—", after: "" };
  }

  function proposalSummary(action) {
    const args = action?.args || {};
    if (action.type === "add_grocery") return `${t("assistantProposalAddGrocery")}: ${args.text}`;
    if (action.type === "edit_grocery") return `${t("assistantProposalEditGrocery")}: ${args.text || ""}${typeof args.checked === "boolean" ? ` · ${args.checked ? t("assistantShoppingMarkedBought") : t("assistantShoppingMarkedUnbought")}` : ""}`;
    if (action.type === "change_meal") return `${t("assistantProposalMeal")}: ${formatDayLabel(args.dateKey)} · ${periodLabel(args.period)} · ${recipeName(args.recipeSourceId.slice(7))}`;
    if (action.type === "add_inventory") return `${t("assistantProposalAddInventory")}: ${args.text}`;
    if (action.type === "update_inventory") return `${t("assistantProposalEditInventory")}: ${stockLabel(args.stockState)}${args.amount !== undefined ? ` · ${args.amount}` : ""}`;
    if (action.type === "update_leftovers") return `${t("assistantProposalLeftovers")}: ${formatDayLabel(args.dateKey)} · ${recipeName(args.recipeSourceId.slice(7))} · ${args.servings}`;
    return "";
  }

  function startProposal(action, message) {
    const summary = proposalSummary(action);
    const details = proposalDetails(action);
    const operationId = message?.id;
    if (action.type === "change_meal") {
      const recipe = recipeById(action.args.recipeSourceId?.slice(7));
      const recommendation = recipe ? recommendationForRecipe(recipe, memoryContext()) : { blocked: true };
      const servingPlan = getMealForDate(action.args.dateKey)?.servingPlans?.[action.args.period] || {};
      if (!recipe || recommendation.blocked) {
        setStatus(t("assistantProposalUnavailable"), true);
        return;
      }
      if (action.args.servings !== undefined && (Number(servingPlan.kids) || Number(servingPlan.guests))) {
        setStatus(t("assistantProposalServingUnavailable"), true);
        return;
      }
    }
    if (!summary || !details || !operationId || consumedProposalIds.has(operationId)) return;
    const existing = pendingProposals.get(operationId);
    if (existing) {
      preview = existing;
      renderChips();
      renderPreview();
      return;
    }
    // These entries can hold a frozen record needed to retry a failed write,
    // so do not evict one to make room for a newer proposal.
    if (pendingProposals.size >= MAX_PENDING_PROPOSALS) {
      setStatus(t("assistantProposalLimit"), true);
      return;
    }
    const frozenRecord = action.type === "add_grocery" && createGroceryItem ? createGroceryItem(action.args.text, { store: action.args.store })
      : action.type === "add_inventory" && createInventoryItem ? createInventoryItem(action.args.text, "", action.args.location || "pantry", [], action.args.stockState || "some", getLang(), "Family", { amount: action.args.amount, unit: action.args.unit }) : null;
    preview = { kind: "proposal", action, summary, details, operationId, frozenRecord, inputFingerprint: proposalFingerprint(action), appliedLocally: false };
    pendingProposals.set(operationId, preview);
    activeAction = "";
    setStatus("");
    renderChips();
    renderPreview();
  }

  function renderConversation() {
    const panel = $("#assistantPreview");
    if (!panel) return;
    if (!conversation.length) {
      panel.innerHTML = `<p class="assistant-preview-empty">${escapeHtml(t("assistantConversationEmpty"))}</p>`;
      updateApplyState();
      return;
    }
    const latest = [...conversation].reverse().find((message) => message.role === "assistant");
    const sourceMap = new Map((latest?.context?.sources || []).map((source) => [source.id, source]));
    const sourceCards = (latest?.reply?.sources || []).map((id) => sourceMap.get(id)).filter(Boolean).map((source) => `
      <button type="button" class="assistant-source-card" data-assistant-source="${escapeHtml(source.id)}">
        <strong>${escapeHtml(sourceLabel(source))}</strong><span>${escapeHtml(source.title)}</span><small>${escapeHtml(source.detail)}</small>
      </button>
    `).join("");
    const action = latest?.reply?.action;
    const actionButton = actionLabel(action) && !consumedProposalIds.has(latest?.id)
      ? `<button type="button" class="assistant-secondary" data-assistant-conversation-action="${escapeHtml(action.type)}" data-assistant-action-source="${escapeHtml(action.sourceId || "")}">${escapeHtml(actionLabel(action))}</button>`
      : "";
    panel.innerHTML = `
      <div class="assistant-conversation" role="log" aria-live="polite" aria-label="${escapeHtml(t("assistantConversationLabel"))}">
        ${conversation.map((message) => `<article class="assistant-message assistant-message-${message.role}"><span>${escapeHtml(t(message.role === "assistant" ? "assistantFamilyHelp" : "assistantYou"))}</span><p>${escapeHtml(message.text)}</p></article>`).join("")}
      </div>
      ${sourceCards ? `<section class="assistant-sources"><h3>${escapeHtml(t("assistantSourcesHeading"))}</h3>${sourceCards}</section>` : ""}
      ${actionButton ? `<div class="assistant-lookup-actions">${actionButton}</div>` : ""}
    `;
    updateApplyState();
  }

  function renderPreview() {
    const panel = $("#assistantPreview");
    if (!panel) return;
    if (!preview) {
      renderConversation();
      return;
    }

    if (preview.kind === "conversation") {
      renderConversation();
      return;
    }

    if (preview.kind === "proposal") {
      panel.innerHTML = `<h3>${escapeHtml(t("assistantProposalHeading"))}</h3><p>${escapeHtml(preview.summary)}</p><dl class="assistant-proposal-diff"><dt>${escapeHtml(t("assistantProposalBefore"))}</dt><dd>${escapeHtml(preview.details.before)}</dd><dt>${escapeHtml(t("assistantProposalAfter"))}</dt><dd>${escapeHtml(preview.details.after)}</dd></dl><p>${escapeHtml(t("assistantProposalConfirm"))}</p>`;
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

  function previewAction(action, { dateWindow = "", keepQuestion = false, dateKeys: requestedDateKeys = [] } = {}) {
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
      const dateKeys = requestedDateKeys.length ? requestedDateKeys : dateKeysForShoppingWindow(dateWindow, current);
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
    if (applying) return;
    const panel = sheet();
    if (!panel) return;
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
    documentObject?.body?.classList?.remove("assistant-open");
    preview = null;
    activeAction = "";
    shoppingDateDraft = null;
    askedQuestion = "";
    requestGeneration += 1;
    activeRequestController?.abort?.();
    activeRequestController = null;
    answering = false;
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
    // Navigation and reopening preserve the short in-memory conversation.
    // New conversation and household exit are the explicit reset boundaries.
    setApplying(false);
    setStatus("");
    renderChips();
    renderPreview();
    const title = $("#assistantSheetTitle");
    if (title) title.textContent = t(source === "plan" ? "assistantHelpPlan" : "assistantHelp");
    $("#assistantClose")?.focus?.();
  }

  function newConversation() {
    if (applying) return;
    requestGeneration += 1;
    activeRequestController?.abort?.();
    activeRequestController = null;
    conversation = [];
    pendingProposals.clear();
    consumedProposalIds.clear();
    preview = null;
    askedQuestion = "";
    const ask = $("#assistantAskInput");
    if (ask) ask.value = "";
    setAnswering(false);
    setStatus("");
    renderPreview();
  }

  async function applyPreview() {
    if (!assistantPreviewNeedsConfirm(preview) || applying) return false;
    setApplying(true);
    setStatus(t("assistantApplying"));
    try {
      if (preview.kind === "proposal") {
        const { action } = preview;
        if (!preview.appliedLocally && proposalFingerprint(action) !== preview.inputFingerprint) {
          setStatus(t("assistantPreviewStale"), true);
          setApplying(false);
          return false;
        }
        const args = action.args || {};
        if (!preview.appliedLocally) {
          if (action.type === "add_grocery" && preview.frozenRecord) {
            setGroceries([preview.frozenRecord, ...getGroceries()]);
          } else if (action.type === "edit_grocery") {
            const id = action.sourceId.slice(8);
            const localizedText = args.text && createGroceryItem ? createGroceryItem(args.text).text : "";
            if (!getGroceries().some((item) => item.id === id)) throw new Error("grocery changed");
            setGroceries(getGroceries().map((item) => item.id === id ? { ...item, ...(localizedText ? { text: localizedText } : {}), ...(typeof args.checked === "boolean" ? { checked: args.checked } : {}), updatedAt: new Date().toISOString() } : item));
          } else if (action.type === "add_inventory" && preview.frozenRecord) {
            setInventory([preview.frozenRecord, ...getInventory()]);
          } else if (action.type === "update_inventory") {
            const id = action.sourceId.slice(10);
            if (!getInventory().some((item) => item.id === id)) throw new Error("inventory changed");
            setInventory(getInventory().map((item) => item.id === id ? { ...item, ...(args.stockState ? { stockState: args.stockState } : {}), ...(args.amount !== undefined ? { amount: args.amount } : {}), updatedAt: new Date().toISOString() } : item));
          } else if (action.type === "change_meal") {
            const recipe = recipeById(args.recipeSourceId?.slice(7));
            if (!recipe || recommendationForRecipe(recipe, memoryContext()).blocked) throw new Error("meal unavailable");
            const current = getMealForDate(args.dateKey);
            const nextItem = { id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, period: args.period, role: "main", sourceType: "recipe", recipeId: args.recipeSourceId.slice(7) };
            const removed = args.mode === "replace" ? current.items.filter((item) => item.period === args.period) : [];
            const items = args.mode === "replace" ? current.items.filter((item) => item.period !== args.period) : [...current.items];
            items.push(nextItem);
            const servingPlans = { ...(current.servingPlans || {}) };
            if (args.servings !== undefined) servingPlans[args.period] = { ...(servingPlans[args.period] || {}), adults: args.servings, kids: 0, guests: 0 };
            const nextCalendarMeals = { ...getCalendarMeals(), [args.dateKey]: { ...current, items, servingPlans } };
            if (removed.length && args.mode !== "replace") throw new Error("meal changed");
            setCalendarMeals(nextCalendarMeals);
          } else if (action.type === "update_leftovers") {
            const current = getMealForDate(args.dateKey);
            const mealItem = current.items.find((item) => item.recipeId === args.recipeSourceId.slice(7) && item.period === "dinner");
            if (!mealItem) throw new Error("meal changed");
            const servingPlans = { ...(current.servingPlans || {}) };
            const dinner = { ...(servingPlans.dinner || {}), actualLeftovers: { ...(servingPlans.dinner?.actualLeftovers || {}), [mealItem.id]: args.servings } };
            setCalendarMeals({ ...getCalendarMeals(), [args.dateKey]: { ...current, servingPlans: { ...servingPlans, dinner }, servingPlan: { ...(current.servingPlan || {}), actualLeftovers: dinner.actualLeftovers } } });
          } else throw new Error("unsupported proposal");
          preview.appliedLocally = true;
          render();
        }
        const saved = action.type.includes("grocery") ? await saveGroceries()
          : action.type.includes("inventory") ? await saveInventory() : await saveSchedule();
        if (saved === false) throw new Error("save proposal");
        consumedProposalIds.add(preview.operationId);
        while (consumedProposalIds.size > MAX_PENDING_PROPOSALS) consumedProposalIds.delete(consumedProposalIds.values().next().value);
        pendingProposals.delete(preview.operationId);
        recordActivity(action.type === "change_meal" || action.type === "update_leftovers" ? "meal" : action.type.includes("inventory") ? "inventory" : "grocery", t("assistantProposalApplied"));
        setApplying(false);
        closeSheet();
        return true;
      }
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

  async function handleAsk(event) {
    event.preventDefault();
    if (applying || answering) return;
    const asked = $("#assistantAskInput")?.value || "";
    askedQuestion = asked.trim();
    if (!askedQuestion) return;
    const previousAssistant = [...conversation].reverse().find((message) => message.role === "assistant");
    const retrievalText = conversation.slice(-4).map((message) => message.text).join(" ");
    const context = buildAssistantContext({
      question: askedQuestion,
      retrievalText,
      priorSourceIds: previousAssistant?.reply?.sources || [],
      language: getLang(),
      now: now(),
      displayedDateKeys: getDisplayedDateKeys(),
      getMealForDate,
      recipes: getRecipes(),
      groceries: getGroceries(),
      inventory: getInventory(),
      availableFood: getAvailableFood(),
      schoolLunches: getSchoolLunches(),
      preferences: getFamilyPreferences(),
      familyMembers: getFamilyMembers(),
      rules: getFamilyRules(),
      dinnerEvents: getDinnerEvents(),
      receipts: getReceipts(),
      budget: getBudget(),
      savedLists: getSavedLists(),
      localize,
    });
    const userMessage = { role: "user", text: askedQuestion };
    conversation = [...conversation, userMessage].slice(-8);
    preview = { kind: "conversation" };
    activeAction = "";
    shoppingDateDraft = null;
    setStatus("");
    setAnswering(true);
    const generation = ++requestGeneration;
    const householdScope = getHouseholdScope();
    activeRequestController?.abort?.();
    activeRequestController = typeof AbortController === "function" ? new AbortController() : null;
    try {
      const response = await askAssistant({
        question: askedQuestion,
        language: getLang(),
        history: boundedConversationHistory(conversation.slice(0, -1)),
        context,
      }, { signal: activeRequestController?.signal, timeoutMs: 15000 });
      if (generation !== requestGeneration || householdScope !== getHouseholdScope()) return;
      const reply = normalizeAssistantReply(response, context);
      if (!reply) throw new Error("invalid reply");
      conversation = [...conversation, { id: `assistant-message-${++conversationMessageSequence}`, role: "assistant", text: reply.answer, reply, context }].slice(-8);
    } catch {
      if (generation !== requestGeneration || householdScope !== getHouseholdScope()) return;
      conversation = [...conversation, { id: `assistant-message-${++conversationMessageSequence}`, role: "assistant", text: t("assistantConversationError") }].slice(-8);
      setStatus(t("assistantConversationError"), true);
    } finally {
      if (generation === requestGeneration && householdScope === getHouseholdScope()) {
        activeRequestController = null;
        setAnswering(false);
      }
    }
  }

  function bindAssistantControls() {
    documentObject?.addEventListener("click", (event) => {
      if (event.target.closest?.("[data-lang]") && isOpen()) {
        // This bubbles after the app's button-level language handler.
        renderChips();
        renderPreview();
        return;
      }
      const opener = event.target.closest?.("[data-open-assistant]");
      if (opener) {
        event.preventDefault();
        openSheet(opener.dataset.openAssistant, opener);
        return;
      }
      if (event.target.closest?.("[data-assistant-new]") && isOpen() && !applying) {
        event.preventDefault();
        newConversation();
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
      const source = event.target.closest?.("[data-assistant-source]");
      if (source && isOpen()) {
        event.preventDefault();
        const latest = [...conversation].reverse().find((message) => message.role === "assistant");
        const cited = latest?.context?.sources?.find((item) => item.id === source.dataset.assistantSource);
        if (!cited) return;
        if (cited.type === "meal" || cited.type === "lunch") {
          closeSheet();
          if (cited.type === "lunch") openLunches();
          else openFocusedDinner(cited.dateKey);
          return;
        }
        if (cited.type === "recipe") {
          closeSheet();
          openRecipe(cited.id.slice("recipe:".length));
          return;
        }
        if (cited.type === "grocery" || cited.type === "saved-list") { closeSheet(); setView("grocery"); return; }
        if (cited.type === "inventory" || cited.type === "available") { closeSheet(); openInventory(); return; }
        if (cited.type === "budget") { closeSheet(); openBudget(); return; }
        if (cited.type === "history") { closeSheet(); if (cited.dateKey) openFocusedDinner(cited.dateKey); else openFamily("history"); return; }
        if (cited.type === "preference") { closeSheet(); openFamily("rules"); }
        return;
      }
      const conversationAction = event.target.closest?.("[data-assistant-conversation-action]");
      if (conversationAction && isOpen() && !answering && !applying) {
        event.preventDefault();
        const latest = [...conversation].reverse().find((message) => message.role === "assistant");
        const action = latest?.reply?.action || { type: "none", sourceId: "", args: {} };
        const actionType = action.type;
        const source = latest?.context?.sources?.find((item) => item.id === action.sourceId);
        if (actionType === "fill_gaps") return previewAction("fill-gaps", { keepQuestion: true });
        if (actionType === "refresh_shopping") return previewAction("refresh-shopping", { keepQuestion: true, dateKeys: action.args?.dateKeys || [] });
        if (["add_grocery", "edit_grocery", "change_meal", "add_inventory", "update_inventory", "update_leftovers"].includes(actionType)) return startProposal(action, latest);
        if (actionType === "open_meal" && source?.dateKey) { closeSheet(); return openFocusedDinner(source.dateKey); }
        if (actionType === "open_recipe" && source?.id?.startsWith("recipe:")) { closeSheet(); return openRecipe(source.id.slice(7)); }
        if (actionType === "open_shop") { closeSheet(); setView("grocery"); return; }
        if (actionType === "open_inventory") { closeSheet(); openInventory(); return; }
        if (actionType === "open_lunches") { closeSheet(); openLunches(); return; }
        if (actionType === "open_budget") { closeSheet(); openBudget(); }
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
      if (event.target.closest?.("[data-assistant-close]") && !applying) {
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
      if (applying || answering) return;
      askedQuestion = $("#assistantAskInput")?.value.trim() || "";
      if (preview?.kind !== "shopping" && preview?.kind !== "fill-dinners" && preview?.kind !== "proposal") return;
      if (preview?.appliedLocally) return;
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
    newConversation,
    previewAction,
    applyPreview,
    refresh: () => {
      renderChips();
      renderPreview();
    },
    getPreview: () => preview,
    isApplying: () => applying,
    isAnswering: () => answering,
    getConversation: () => [...conversation],
    isOpen,
  };
}
