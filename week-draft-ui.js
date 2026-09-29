import { createWeekDraft } from "./week-planner-logic.js";
import { recoverWeekDraft, serializeWeekDraftRecovery, WEEK_DRAFT_RECOVERY_KEY } from "./week-draft-recovery.js";

const SHOPPING_REVIEW_KEY = "dinner-week-shopping-review-v1";

export function createWeekDraftUi({ $, t, escapeHtml, localize, getPlannerInput, getCatalogStatus, householdStorage, onApprove, onShoppingPreview, onShoppingUpdate, onOpenPlan = () => {} }) {
  const panel = $("#weekDraftPanel");
  const shopReminder = $("#weekShoppingReminder");
  let draft = null;
  let selected = new Set();
  let busy = false;
  let message = "";
  let conflictDates = [];
  let shoppingReviewWeek = "";
  let shoppingDone = false;
  let shoppingPreview = null;
  let shoppingStatus = "";
  let restoreAttempted = false;
  let recoveryRaw = null;
  let draftNeedsReview = false;
  const focusControl = (selector) => panel?.querySelector(selector)?.focus({ preventScroll: true });

  function persistRecovery() {
    restoreAttempted = true;
    try {
      if (!draft) {
        householdStorage.removeItem(WEEK_DRAFT_RECOVERY_KEY);
        recoveryRaw = null;
        return;
      }
      const raw = serializeWeekDraftRecovery({ draft, selectedDateKeys: selected, input: getPlannerInput() });
      if (!raw) throw new Error("Draft exceeds local recovery limit.");
      householdStorage.setItem(WEEK_DRAFT_RECOVERY_KEY, raw);
      recoveryRaw = raw;
    } catch {
      recoveryRaw = null;
      message = "weekDraftRecoveryUnavailable";
    }
  }

  function isNewChoice(day) {
    return Boolean(day.recipeId && day.status !== "unresolved"
      && !draft.base.effectiveMealsByDate[day.dateKey]?.dinner);
  }

  function render() {
    if (!panel) return;
    const input = getPlannerInput();
    const ready = getCatalogStatus() === "ready";
    if (ready && !restoreAttempted) {
      restoreAttempted = true;
      try {
        shoppingReviewWeek = householdStorage.getItem(SHOPPING_REVIEW_KEY) || "";
        recoveryRaw = householdStorage.getItem(WEEK_DRAFT_RECOVERY_KEY);
        const recovered = recoverWeekDraft(recoveryRaw, input);
        if (recovered.status === "restored") {
          draft = recovered.draft;
          selected = new Set(recovered.selectedDateKeys);
          draftNeedsReview = false;
          message = "weekDraftRecovered";
        } else if (recovered.status === "stale") message = "weekDraftRecoveryStale";
      } catch { message = "weekDraftRecoveryUnavailable"; }
    }
    if (draft && (draft.weekStartKey !== input.weekStartKey
      || (ready && recoveryRaw && recoverWeekDraft(recoveryRaw, input).status !== "restored"))) {
      draftNeedsReview = true;
      message = "weekDraftRecoveryStale";
      conflictDates = [];
    }
    if (shoppingReviewWeek && shoppingReviewWeek !== input.weekStartKey) {
      shoppingReviewWeek = "";
      shoppingPreview = null;
      shoppingStatus = "";
    }
    if (shopReminder) shopReminder.hidden = shoppingReviewWeek !== input.weekStartKey;
    const choiceDays = draft?.days.filter(isNewChoice) || [];
    const openDays = draft?.days.filter((day) => !day.recipeId).length || 0;
    const shoppingRows = shoppingPreview?.changes.map((change) => {
      const before = change.before ? localize(change.before.text) : "";
      const after = change.after ? localize(change.after.text) : "";
      const amount = before && after && before !== after ? `${before} → ${after}` : after || before;
      return `<li>${escapeHtml(t(`weekDraftShopping${change.kind[0].toUpperCase()}${change.kind.slice(1)}`))}: ${escapeHtml(amount)}${change.needsPurchaseReview ? ` <strong>${escapeHtml(t("weekDraftShoppingCheckedReview"))}</strong>` : ""}</li>`;
    }).join("") || "";
    const shoppingAction = shoppingPreview?.changes.length
      ? shoppingPreview.needsPurchaseReview
        ? `<p class="week-draft-shopping-alert">${escapeHtml(t("weekDraftShoppingBlocked"))}</p>`
        : `<button class="primary-action" type="button" data-week-draft="update-shopping" ${busy ? "disabled" : ""}>${escapeHtml(t(busy ? "weekDraftShoppingSaving" : "weekDraftShoppingUpdate"))}</button>`
      : "";
    panel.innerHTML = `
      <div class="week-draft-heading">
        <div><h3>${escapeHtml(t("weekDraftHeading"))}</h3><p>${escapeHtml(t(draft ? "weekDraftReviewIntro" : "weekDraftIntro"))}</p></div>
        ${draft ? `<details class="week-draft-more"><summary>${escapeHtml(t("weekDraftMore"))}</summary><button class="text-button" type="button" data-week-draft="generate" ${busy || !ready ? "disabled" : ""}>${escapeHtml(t("weekDraftRegenerate"))}</button><button class="text-button" type="button" data-week-draft="reset" ${busy ? "disabled" : ""}>${escapeHtml(t("weekDraftStartOver"))}</button></details>` : `<button class="primary-action" type="button" data-week-draft="generate" ${busy || !ready ? "disabled" : ""}>${escapeHtml(t("weekDraftGenerate"))}</button>`}
      </div>
      ${!ready ? `<p class="week-draft-note">${escapeHtml(t(getCatalogStatus() === "loading" ? "recipeCatalogLoading" : "recipeCatalogUnavailable"))}</p>` : ""}
      ${draft ? `<p class="week-draft-step">${escapeHtml(t("weekDraftStepReview"))}</p><ol class="week-draft-days">${draft.days.filter((day) => day.recipeId).map((day) => {
        const recipe = input.recipes.find((item) => item.id === day.recipeId);
        const label = new Intl.DateTimeFormat(input.lang === "es" ? "es-US" : "en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${day.dateKey}T12:00:00`));
        const newChoice = isNewChoice(day);
        const reason = day.needsRestrictionReview ? t("weekDraftRestrictionReview")
          : day.reasonCodes.includes("restriction-needs-review") ? t("weekDraftRestrictionReviewed")
          : day.status === "unresolved" ? t(day.reasonCodes.includes("outside-dinner-target") ? "weekDraftOpenDay"
            : day.reasonCodes.includes("ingredients-unknown") ? "weekDraftIngredientsReview" : "weekDraftNoMatch")
          : day.status === "kept" && !newChoice ? t("weekDraftAlreadyPlanned")
            : day.reasonCodes.includes("uses-home-food") ? t("weekDraftHomeReason")
              : day.reasonCodes.includes("favorite") || day.reasonCodes.includes("liked") ? t("weekDraftFavoriteReason")
                : t("weekDraftKnownRecipe");
        return `<li class="week-draft-day">
          <span class="week-draft-date">${escapeHtml(label)}</span>
          <span class="week-draft-meal"><strong>${escapeHtml(recipe ? localize(recipe.name) : day.recipeId ? t("weekDraftUnavailableRecipe") : t("weekDraftNeedsChoice"))}</strong><small>${escapeHtml(reason)}</small></span>
          ${newChoice ? `<div class="week-draft-controls"><button type="button" class="text-button" data-week-draft-swap="${escapeHtml(day.dateKey)}" aria-label="${escapeHtml(`${t("weekDraftSwap")} ${label}`)}" ${busy || draftNeedsReview ? "disabled" : ""}>${escapeHtml(t("weekDraftSwap"))}</button><details><summary>${escapeHtml(t("weekDraftDayOptions"))}</summary><label><input type="checkbox" data-week-draft-select="${escapeHtml(day.dateKey)}" aria-label="${escapeHtml(`${t("weekDraftInclude")} ${label}`)}" ${selected.has(day.dateKey) ? "checked" : ""} ${busy || draftNeedsReview || day.needsRestrictionReview ? "disabled" : ""}>${escapeHtml(t("weekDraftInclude"))}</label><button type="button" class="text-button" data-week-draft-keep="${escapeHtml(day.dateKey)}" aria-label="${escapeHtml(`${t(day.locked ? "weekDraftUnlock" : "weekDraftKeep")} ${label}`)}" ${busy || draftNeedsReview ? "disabled" : ""}>${escapeHtml(t(day.locked ? "weekDraftUnlock" : "weekDraftKeep"))}</button></details></div>` : ""}
          ${newChoice && day.reasonCodes.includes("restriction-needs-review") ? `<details class="week-draft-restriction" data-restriction-day="${escapeHtml(day.dateKey)}"><summary>${escapeHtml(t(day.needsRestrictionReview ? "weekDraftCheckIngredients" : "weekDraftRestrictionReviewed"))}</summary><p>${escapeHtml(t("weekDraftRestrictionCaution"))}</p><ul>${(recipe?.ingredients?.[input.lang] || recipe?.ingredients?.en || recipe?.ingredients?.es || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><label><input type="checkbox" data-week-draft-review="${escapeHtml(day.dateKey)}" ${day.needsRestrictionReview ? "" : "checked"} ${busy || draftNeedsReview ? "disabled" : ""}>${escapeHtml(t("weekDraftRestrictionConfirm"))}</label></details>` : ""}
        </li>`;
      }).join("")}</ol>${openDays ? `<p class="week-draft-open-days">${escapeHtml(t("weekDraftOpenDays").replace("{count}", openDays))}</p>` : ""}
      <div class="week-draft-footer"><p>${escapeHtml(t("weekDraftShoppingLater"))}</p><button class="primary-action" type="button" data-week-draft="approve" ${busy || draftNeedsReview || !selected.size || draft.days.some((day) => selected.has(day.dateKey) && day.needsRestrictionReview) ? "disabled" : ""}>${escapeHtml(t(busy ? "weekDraftSaving" : "weekDraftApprove"))}</button></div>` : ""}
      <p class="week-draft-message" role="status" tabindex="-1">${escapeHtml(message ? t(message) : choiceDays.length ? t("weekDraftReviewPrompt") : "")}${conflictDates.length ? ` ${escapeHtml(conflictDates.join(", "))}` : ""}</p>
      ${(shoppingReviewWeek || shoppingDone) && !draft ? `<div class="week-draft-shopping">${shoppingReviewWeek ? `<button class="ghost-button" type="button" data-week-draft="shopping" ${busy ? "disabled" : ""}>${escapeHtml(t("weekDraftReviewShopping"))}</button>` : ""}${shoppingPreview ? `<p>${escapeHtml(shoppingPreview.changes.length ? t("weekDraftShoppingPreviewIntro") : t("weekDraftShoppingNoChanges"))}</p><ul>${shoppingRows}</ul>${shoppingAction}<p>${escapeHtml(t("weekDraftShoppingPreviewOnly"))}</p>` : ""}<p role="status" tabindex="-1">${escapeHtml(shoppingStatus ? t(shoppingStatus) : "")}</p></div>` : ""}
    `;
  }

  function generate(previousDraft = null, excludedRecipeIds = []) {
    const input = getPlannerInput();
    draft = createWeekDraft({ ...input, previousDraft, excludedRecipeIds });
    draftNeedsReview = false;
    selected = new Set(draft.days.filter((day) => isNewChoice(day) && !day.needsRestrictionReview).map((day) => day.dateKey));
    message = "";
    conflictDates = [];
    persistRecovery();
    render();
  }

  function bind() {
    if (!panel) return;
    $("#weekShoppingOpenPlan")?.addEventListener("click", () => {
      onOpenPlan();
      focusControl('[data-week-draft="shopping"]');
    });
    panel.addEventListener("change", (event) => {
      const reviewedDate = event.target.dataset.weekDraftReview;
      if (reviewedDate && draft && !draftNeedsReview) {
        const day = draft.days.find((item) => item.dateKey === reviewedDate);
        if (day && day.reasonCodes.includes("restriction-needs-review")) {
          day.needsRestrictionReview = !event.target.checked;
          if (event.target.checked) selected.add(reviewedDate);
          else selected.delete(reviewedDate);
          persistRecovery();
          render();
          focusControl(`[data-restriction-day="${reviewedDate}"] summary`);
        }
        return;
      }
      const dateKey = event.target.dataset.weekDraftSelect;
      if (!dateKey) return;
      if (event.target.checked) selected.add(dateKey);
      else selected.delete(dateKey);
      persistRecovery();
      render();
    });
    panel.addEventListener("click", async (event) => {
      if (busy) return;
      const button = event.target.closest("button");
      if (!button || !panel.contains(button)) return;
      if (button.dataset.weekDraft === "generate") {
        generate(draftNeedsReview ? null : draft, draftNeedsReview ? [] : draft?.constraints.excludedRecipeIds || []);
        focusControl('[data-week-draft="generate"]');
      } else if (button.dataset.weekDraft === "reset") {
        draft = null;
        selected = new Set();
        draftNeedsReview = false;
        message = "";
        conflictDates = [];
        persistRecovery();
        render();
        focusControl('[data-week-draft="generate"]');
      } else if (button.dataset.weekDraftKeep && draft && !draftNeedsReview) {
        const day = draft.days.find((item) => item.dateKey === button.dataset.weekDraftKeep);
        if (day) day.locked = !day.locked;
        persistRecovery();
        render();
        focusControl(`[data-week-draft-keep="${button.dataset.weekDraftKeep}"]`);
      } else if (button.dataset.weekDraftSwap && draft && !draftNeedsReview) {
        const dateKey = button.dataset.weekDraftSwap;
        const original = draft;
        const originalSelected = new Set(selected);
        const prior = structuredClone(draft);
        const swapped = prior.days.find((day) => day.dateKey === dateKey);
        if (!swapped) return;
        prior.days.forEach((day) => { if (day.dateKey !== dateKey && isNewChoice(day)) day.locked = true; });
        swapped.locked = false;
        generate(prior, [...new Set([...draft.constraints.excludedRecipeIds, swapped.recipeId])]);
        if (!draft.days.find((day) => day.dateKey === dateKey)?.recipeId) {
          draft = original;
          selected = originalSelected;
          message = "weekDraftNoAlternative";
          persistRecovery();
          render();
        }
        focusControl(`[data-week-draft-swap="${dateKey}"]`);
      } else if (button.dataset.weekDraft === "approve" && draft && selected.size && !draftNeedsReview) {
        busy = true;
        message = "weekDraftSaving";
        render();
        let result;
        try { result = await onApprove(draft, [...selected]); }
        catch { result = { status: "save-error" }; }
        busy = false;
        message = ({ saved: "weekDraftSaved", "saved-pending-review": "weekDraftSavedPendingReview", conflict: "weekDraftConflict", invalid: "weekDraftInvalid", "load-error": "weekDraftLoadError", "save-error": "weekDraftSaveError", "no-change": "weekDraftNoChange" })[result.status] || "weekDraftSaveError";
        conflictDates = Array.isArray(result.conflicts) ? result.conflicts : [];
        if (result.status === "saved") { draft = null; selected = new Set(); }
        if (result.status === "saved") {
          shoppingReviewWeek = getPlannerInput().weekStartKey;
          shoppingDone = false;
          shoppingPreview = null;
          shoppingStatus = "";
          try { householdStorage.setItem(SHOPPING_REVIEW_KEY, shoppingReviewWeek); }
          catch { shoppingStatus = "weekDraftShoppingReminderUnavailable"; }
        }
        if (result.status === "saved") persistRecovery();
        render();
        focusControl(".week-draft-message");
      } else if (button.dataset.weekDraft === "shopping" && shoppingReviewWeek) {
        busy = true;
        shoppingStatus = "weekDraftShoppingLoading";
        render();
        let result;
        try { result = await onShoppingPreview(); }
        catch { result = { status: "load-error" }; }
        busy = false;
        shoppingPreview = result.status === "ready" ? result : null;
        shoppingStatus = ({ pending: "weekDraftShoppingPending", stale: "weekDraftShoppingStale", "load-error": "weekDraftShoppingLoadError" })[result.status] || "";
        if (result.status === "ready" && !result.changes.length) {
          shoppingReviewWeek = "";
          shoppingDone = true;
          shoppingStatus = "weekDraftShoppingNoChanges";
          message = "";
          shoppingPreview = null;
          try { householdStorage.removeItem(SHOPPING_REVIEW_KEY); } catch { /* reminder expires with this week */ }
        }
        render();
        focusControl(shoppingDone ? ".week-draft-shopping [role=status]" : '[data-week-draft="shopping"]');
      } else if (button.dataset.weekDraft === "update-shopping" && shoppingPreview && !shoppingPreview.needsPurchaseReview) {
        busy = true;
        shoppingStatus = "weekDraftShoppingSaving";
        render();
        let result;
        try { result = await onShoppingUpdate(shoppingPreview); }
        catch { result = { status: "save-error" }; }
        busy = false;
        shoppingStatus = ({ saved: "weekDraftShoppingSaved", "saved-pending-review": "weekDraftShoppingSavedPending", pending: "weekDraftShoppingPending", stale: "weekDraftShoppingStale", conflict: "weekDraftShoppingConflict", "review-required": "weekDraftShoppingBlocked", "load-error": "weekDraftShoppingLoadError", "save-error": "weekDraftShoppingSaveError", "no-change": "weekDraftShoppingNoChanges", invalid: "weekDraftShoppingStale" })[result.status] || "weekDraftShoppingSaveError";
        shoppingPreview = null;
        if (["saved", "no-change"].includes(result.status)) {
          shoppingReviewWeek = "";
          shoppingDone = true;
          message = "";
          try { householdStorage.removeItem(SHOPPING_REVIEW_KEY); } catch { /* review stays available */ }
        }
        render();
        focusControl(shoppingDone ? ".week-draft-shopping [role=status]" : '[data-week-draft="shopping"]');
      }
    });
  }

  return { bind, render };
}
