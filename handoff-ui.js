import {
  leftoverServingOptions,
  leftoverUseOptions,
  snackStatusOptions,
} from "./schedule-utils.js";
import { localizedText } from "./localized-data.js";

function choiceMarkup({ field, options, value, context, t, escapeHtml, inputAttributes }) {
  const attributes = typeof inputAttributes === "function"
    ? inputAttributes(field)
    : inputAttributes;
  return options.map((option) => `
    <label class="handoff-choice">
      <input type="radio" name="${escapeHtml(`${context}-${field}`)}" value="${escapeHtml(option.key)}" ${attributes} ${value === option.key ? "checked" : ""} />
      <span>${escapeHtml(t(option.label))}</span>
    </label>
  `).join("");
}

export function renderHandoffDetails({
  meal,
  context,
  t,
  escapeHtml,
  localize,
  mealRecipes,
  inputAttributes,
  getLang,
}) {
  const handoff = meal.handoff || {};
  if (!handoff.leftovers && !handoff.kidsSnack) return "";

  const recipeNames = mealRecipes(meal)
    .map(({ recipe }) => localize(recipe.name))
    .filter(Boolean)
    .map((name) => escapeHtml(name))
    .join(", ");
  const source = recipeNames || t("leftoversSourceUnknown");
  const attributes = inputAttributes || (() => `data-handoff-context="${escapeHtml(context)}"`);

  return `
    <div class="handoff-details">
      ${handoff.leftovers ? `
        <section class="handoff-detail-group" aria-labelledby="${escapeHtml(`${context}-leftovers-heading`)}">
          <h4 id="${escapeHtml(`${context}-leftovers-heading`)}">${t("leftoversDetailLabel")}</h4>
          <p class="handoff-detail-context"><strong>${t("leftoversFrom")}:</strong> ${source}</p>
          <div class="handoff-detail-line">
            <span class="handoff-detail-label">${t("leftoverServingsLabel")}</span>
            <div class="handoff-choice-row" role="group" aria-label="${escapeHtml(t("leftoverServingsLabel"))}">
              ${choiceMarkup({ field: "leftoverServings", options: leftoverServingOptions, value: handoff.leftoverServings, context, t, escapeHtml, inputAttributes: attributes })}
            </div>
          </div>
          <div class="handoff-detail-line">
            <span class="handoff-detail-label">${t("leftoverUseFirstLabel")}</span>
            <div class="handoff-choice-row" role="group" aria-label="${escapeHtml(t("leftoverUseFirstLabel"))}">
              ${choiceMarkup({ field: "leftoverUseFirst", options: leftoverUseOptions, value: handoff.leftoverUseFirst, context, t, escapeHtml, inputAttributes: attributes })}
            </div>
          </div>
        </section>
      ` : ""}
      ${handoff.kidsSnack ? `
        <section class="handoff-detail-group" aria-labelledby="${escapeHtml(`${context}-snack-heading`)}">
          <h4 id="${escapeHtml(`${context}-snack-heading`)}">${t("snackDetailLabel")}</h4>
          <label class="handoff-snack-name">
            <span class="handoff-detail-label">${t("snackNameLabel")}</span>
            <input type="text" maxlength="120" value="${escapeHtml(localizedText(handoff.snack, getLang()))}" placeholder="${escapeHtml(t("snackNamePlaceholder"))}" ${attributes("snack")} />
          </label>
          <div class="handoff-detail-line">
            <span class="handoff-detail-label">${t("snackStatusLabel")}</span>
            <div class="handoff-choice-row" role="group" aria-label="${escapeHtml(t("snackStatusLabel"))}">
              ${choiceMarkup({ field: "snackStatus", options: snackStatusOptions, value: handoff.snackStatus, context, t, escapeHtml, inputAttributes: attributes })}
            </div>
          </div>
        </section>
      ` : ""}
    </div>
  `;
}
