import { createWeekDraft } from "./week-planner-logic.js";

export function createWeekDraftUi({ $, t, escapeHtml, localize, getPlannerInput, getCatalogStatus, onApprove, onShoppingPreview, onShoppingUpdate }) {
  const panel = $("#weekDraftPanel");
  let draft = null;
  let selected = new Set();
  let busy = false;
  let message = "";
  let conflictDates = [];
  let shoppingReviewWeek = "";
  let shoppingPreview = null;
  let shoppingStatus = "";
  const focusControl = (selector) => panel?.querySelector(selector)?.focus({ preventScroll: true });

  function isNewChoice(day) {
    return Boolean(day.recipeId && day.status !== "unresolved"
      && !draft.base.effectiveMealsByDate[day.dateKey]?.dinner);
  }

  function render() {
    if (!panel) return;
    const input = getPlannerInput();
    if (draft && draft.weekStartKey !== input.weekStartKey) {
      draft = null;
      selected = new Set();
      message = "";
      conflictDates = [];
    }
    if (shoppingReviewWeek && shoppingReviewWeek !== input.weekStartKey) {
      shoppingReviewWeek = "";
      shoppingPreview = null;
      shoppingStatus = "";
    }
    const ready = getCatalogStatus() === "ready";
    const choiceDays = draft?.days.filter(isNewChoice) || [];
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
        <div><p class="view-kicker">${escapeHtml(t("weekDraftKicker"))}</p><h3>${escapeHtml(t("weekDraftHeading"))}</h3><p>${escapeHtml(t("weekDraftIntro"))}</p></div>
        <div class="week-draft-heading-actions"><button class="ghost-button" type="button" data-week-draft="generate" ${busy || !ready ? "disabled" : ""}>${escapeHtml(t(draft ? "weekDraftRegenerate" : "weekDraftGenerate"))}</button>${draft ? `<button class="text-button" type="button" data-week-draft="reset" ${busy ? "disabled" : ""}>${escapeHtml(t("weekDraftStartOver"))}</button>` : ""}</div>
      </div>
      ${!ready ? `<p class="week-draft-note">${escapeHtml(t(getCatalogStatus() === "loading" ? "recipeCatalogLoading" : "recipeCatalogUnavailable"))}</p>` : ""}
      ${draft ? `<ol class="week-draft-days">${draft.days.map((day) => {
        const recipe = input.recipes.find((item) => item.id === day.recipeId);
        const label = new Intl.DateTimeFormat(input.lang === "es" ? "es-US" : "en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${day.dateKey}T12:00:00`));
        const newChoice = isNewChoice(day);
        const reason = day.status === "unresolved" ? t(day.needsRestrictionReview ? "weekDraftRestrictionReview"
          : day.reasonCodes.includes("outside-dinner-target") ? "weekDraftOpenDay"
            : day.reasonCodes.includes("ingredients-unknown") ? "weekDraftIngredientsReview" : "weekDraftNoMatch")
          : day.status === "kept" && !newChoice ? t("weekDraftAlreadyPlanned")
            : day.reasonCodes.includes("uses-home-food") ? t("weekDraftHomeReason")
              : day.reasonCodes.includes("favorite") || day.reasonCodes.includes("liked") ? t("weekDraftFavoriteReason")
                : t("weekDraftKnownRecipe");
        return `<li class="week-draft-day">
          <span class="week-draft-date">${escapeHtml(label)}</span>
          <span class="week-draft-meal"><strong>${escapeHtml(recipe ? localize(recipe.name) : day.recipeId ? t("weekDraftUnavailableRecipe") : t("weekDraftNeedsChoice"))}</strong><small>${escapeHtml(reason)}</small></span>
          ${newChoice ? `<span class="week-draft-controls"><label><input type="checkbox" data-week-draft-select="${escapeHtml(day.dateKey)}" aria-label="${escapeHtml(`${t("weekDraftInclude")} ${label}`)}" ${selected.has(day.dateKey) ? "checked" : ""} ${busy ? "disabled" : ""}>${escapeHtml(t("weekDraftInclude"))}</label><button type="button" class="text-button" data-week-draft-swap="${escapeHtml(day.dateKey)}" aria-label="${escapeHtml(`${t("weekDraftSwap")} ${label}`)}" ${busy ? "disabled" : ""}>${escapeHtml(t("weekDraftSwap"))}</button><button type="button" class="text-button" data-week-draft-keep="${escapeHtml(day.dateKey)}" aria-label="${escapeHtml(`${t(day.locked ? "weekDraftUnlock" : "weekDraftKeep")} ${label}`)}" ${busy ? "disabled" : ""}>${escapeHtml(t(day.locked ? "weekDraftUnlock" : "weekDraftKeep"))}</button></span>` : ""}
        </li>`;
      }).join("")}</ol>
      <div class="week-draft-footer"><p>${escapeHtml(t("weekDraftShoppingLater"))}</p><button class="primary-action" type="button" data-week-draft="approve" ${busy || !selected.size ? "disabled" : ""}>${escapeHtml(t(busy ? "weekDraftSaving" : "weekDraftApprove"))}</button></div>` : ""}
      <p class="week-draft-message" role="status" tabindex="-1">${escapeHtml(message ? t(message) : choiceDays.length ? t("weekDraftReviewPrompt") : "")}${conflictDates.length ? ` ${escapeHtml(conflictDates.join(", "))}` : ""}</p>
      ${shoppingReviewWeek && !draft ? `<div class="week-draft-shopping"><button class="ghost-button" type="button" data-week-draft="shopping" ${busy ? "disabled" : ""}>${escapeHtml(t("weekDraftReviewShopping"))}</button>${shoppingPreview ? `<p>${escapeHtml(shoppingPreview.changes.length ? t("weekDraftShoppingPreviewIntro") : t("weekDraftShoppingNoChanges"))}</p><ul>${shoppingRows}</ul>${shoppingAction}<p>${escapeHtml(t("weekDraftShoppingPreviewOnly"))}</p>` : ""}<p role="status">${escapeHtml(shoppingStatus ? t(shoppingStatus) : "")}</p></div>` : ""}
    `;
  }

  function generate(previousDraft = null, excludedRecipeIds = []) {
    const input = getPlannerInput();
    draft = createWeekDraft({ ...input, previousDraft, excludedRecipeIds });
    selected = new Set(draft.days.filter(isNewChoice).map((day) => day.dateKey));
    message = "";
    conflictDates = [];
    render();
  }

  function bind() {
    if (!panel) return;
    panel.addEventListener("change", (event) => {
      const dateKey = event.target.dataset.weekDraftSelect;
      if (!dateKey) return;
      if (event.target.checked) selected.add(dateKey);
      else selected.delete(dateKey);
      render();
    });
    panel.addEventListener("click", async (event) => {
      if (busy) return;
      const button = event.target.closest("button");
      if (!button || !panel.contains(button)) return;
      if (button.dataset.weekDraft === "generate") {
        generate(draft, draft?.constraints.excludedRecipeIds || []);
        focusControl('[data-week-draft="generate"]');
      } else if (button.dataset.weekDraft === "reset") {
        draft = null;
        selected = new Set();
        message = "";
        conflictDates = [];
        render();
        focusControl('[data-week-draft="generate"]');
      } else if (button.dataset.weekDraftKeep && draft) {
        const day = draft.days.find((item) => item.dateKey === button.dataset.weekDraftKeep);
        if (day) day.locked = !day.locked;
        render();
        focusControl(`[data-week-draft-keep="${button.dataset.weekDraftKeep}"]`);
      } else if (button.dataset.weekDraftSwap && draft) {
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
          render();
        }
        focusControl(`[data-week-draft-swap="${dateKey}"]`);
      } else if (button.dataset.weekDraft === "approve" && draft && selected.size) {
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
        if (result.status === "saved") { shoppingReviewWeek = getPlannerInput().weekStartKey; shoppingPreview = null; shoppingStatus = ""; }
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
        render();
        focusControl('[data-week-draft="shopping"]');
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
        render();
        focusControl('[data-week-draft="shopping"]');
      }
    });
  }

  return { bind, render };
}
