import {
  completeLunchIdeas,
  generateLunch,
  generateLunchWeek,
  lunchCatalog,
  lunchComponentKeys,
  lunchFavoritesFor,
  lunchFoodBlockedByRestrictions,
  lunchFoodById,
  lunchPlanComplete,
  lunchPlanSignature,
  lunchPreferenceFor,
  nextSchoolDateKey,
  normalizeLunchPlan,
  normalizeSchoolLunches,
  rateLunchFood,
  saveLunchCombination,
  schoolWeekDateKeys,
  setLunchDayType,
  setLunchPlan,
  setLunchSetting,
  toggleLunchFoodFavorite,
} from "./lunch-logic.js";

const componentLabels = {
  main: "lunchMain",
  produce: "lunchProduce",
  side: "lunchSide",
  extra: "lunchExtra",
  drink: "lunchDrink",
};

const dayTypeLabels = {
  pack: "lunchPackFromHome",
  "school-lunch": "lunchSchoolLunch",
  "pizza-day": "lunchPizzaDay",
  "no-school": "lunchNoSchool",
  "field-trip": "lunchFieldTrip",
};

function foodArt(food) {
  const component = food?.component || "extra";
  const shapes = {
    main: '<rect x="20" y="24" width="56" height="12" rx="6"/><path d="M26 22 48 11l22 11"/><path d="M27 38h42l-6 14H33z"/>',
    produce: '<circle cx="43" cy="33" r="17"/><path d="M45 15c6-8 13-9 19-6-3 7-9 11-17 10"/><path d="M28 35c8 5 21 5 30 0"/>',
    side: '<rect x="22" y="17" width="42" height="34" rx="7"/><circle cx="33" cy="28" r="2"/><circle cx="52" cy="28" r="2"/><circle cx="33" cy="41" r="2"/><circle cx="52" cy="41" r="2"/>',
    extra: '<path d="M26 17h37l-4 35H30z"/><path d="M22 17h45"/><path d="M35 29h18"/>',
    drink: '<path d="M34 12h17v8l5 7v28H29V27l5-7z"/><path d="M33 36h23"/><path d="M37 12h11"/>',
  };
  return `<svg class="lunch-food-art lunch-food-art-${component}" viewBox="0 0 88 64" aria-hidden="true" focusable="false">${shapes[component]}</svg>`;
}

function sparkleIcon() {
  return '<svg class="lunch-button-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1c.7 4.8 3.2 7.3 8 8-4.8.7-7.3 3.2-8 8-.7-4.8-3.2-7.3-8-8 4.8-.7 7.3-3.2 8-8Z"/></svg>';
}

function heartIcon(filled = false) {
  return `<svg class="lunch-heart" viewBox="0 0 24 24" aria-hidden="true"><path ${filled ? 'class="is-filled"' : ""} d="M12 20.4 4.3 13A5.2 5.2 0 0 1 12 6a5.2 5.2 0 0 1 7.7 7Z"/></svg>`;
}

function checkIcon() {
  return '<svg class="lunch-check-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-9"/></svg>';
}

export function createLunchUi({
  $,
  t,
  escapeHtml,
  localize,
  getLang,
  getSchoolLunches,
  setSchoolLunches,
  getChildren,
  getRestrictionsByMember,
  getLunchContext,
  getHouseholdMember,
  saveSharedState,
  syncApprovedLunchGroceries,
  setView,
}) {
  let mode = "home";
  let builder = null;
  let swapComponent = "";
  let packing = null;
  let ideaMemberId = "";
  let ideaDateKey = "";

  const state = () => normalizeSchoolLunches(getSchoolLunches());
  const children = () => getChildren().filter((member) => member.active !== false && member.role === "child");
  const childFor = (memberId) => children().find((member) => member.id === memberId) || null;
  const memberSettings = (memberId) => state().settings[memberId] || { maxPrepMinutes: 10, coldPack: true, reheat: false };
  const formatDate = (dateKey, options = {}) => new Intl.DateTimeFormat(getLang() === "es" ? "es-US" : "en-US", {
    weekday: options.short ? "short" : "long",
    month: options.month ? "short" : undefined,
    day: options.month ? "numeric" : undefined,
  }).format(new Date(`${dateKey}T12:00:00`));

  function generatedPlan(memberId, dateKey, exclude = {}) {
    return generateLunch({
      state: state(),
      memberId,
      dateKey,
      restrictions: getRestrictionsByMember()[memberId] || [],
      context: getLunchContext(dateKey),
      settings: memberSettings(memberId),
      exclude,
    });
  }

  function planFor(memberId, dateKey) {
    return state().plans[dateKey]?.[memberId] || generatedPlan(memberId, dateKey);
  }

  function foodAllowedFor(memberId, foodOrId) {
    const food = typeof foodOrId === "string" ? lunchFoodById(foodOrId) : foodOrId;
    if (!food) return false;
    const settings = memberSettings(memberId);
    const preference = lunchPreferenceFor(state(), memberId, food.id);
    return !lunchFoodBlockedByRestrictions(food, getRestrictionsByMember()[memberId] || [])
      && preference?.rating !== "never"
      && (settings.coldPack !== false || !food.needsCold)
      && (settings.reheat === true || !food.needsHeat)
      && Number(food.prepMinutes || 0) <= Number(settings.maxPrepMinutes || 10);
  }

  function safePlanFor(memberId, dateKey, plan) {
    const normalized = normalizeLunchPlan(plan);
    const fallback = generatedPlan(memberId, dateKey, normalized.components);
    const components = Object.fromEntries(lunchComponentKeys.map((component) => {
      const foodId = normalized.components[component];
      return [component, foodAllowedFor(memberId, foodId) ? foodId : fallback.components[component]];
    }));
    return normalizeLunchPlan({ ...normalized, components, approved: false });
  }

  function planIsSafeFor(memberId, plan) {
    const normalized = normalizeLunchPlan(plan);
    if (!lunchPlanComplete(normalized)) return false;
    return lunchComponentKeys.every((component) => foodAllowedFor(memberId, normalized.components[component]));
  }

  function foodName(foodId) {
    return localize(lunchFoodById(foodId)?.name) || t("lunchNotChosen");
  }

  function planFoodList(plan, { checklist = false } = {}) {
    const normalized = normalizeLunchPlan(plan);
    return lunchComponentKeys.map((component) => {
      const food = lunchFoodById(normalized.components[component]);
      if (!food) return checklist ? "" : `<li class="is-missing"><span>${escapeHtml(t(componentLabels[component]))}</span><strong>${escapeHtml(t("lunchNoSafeOption"))}</strong></li>`;
      const checked = normalized.packedSlots.includes(component);
      return checklist
        ? `<button class="packing-check${checked ? " is-checked" : ""}" type="button" data-pack-slot="${component}" aria-pressed="${checked}"><span class="packing-checkmark" aria-hidden="true">${checked ? checkIcon() : ""}</span><span>${escapeHtml(localize(food.name))}</span></button>`
        : `<li><span>${escapeHtml(t(componentLabels[component]))}</span><strong>${escapeHtml(localize(food.name))}</strong></li>`;
    }).join("");
  }

  function lunchCard(member, dateKey) {
    const plan = planFor(member.id, dateKey);
    if (plan.dayType !== "pack") {
      return `<article class="tomorrow-lunch-card is-special">
        <div class="lunch-card-heading"><div><h3>${escapeHtml(member.name)}</h3><p>${escapeHtml(formatDate(dateKey))}</p></div></div>
        <p class="lunch-special-label">${escapeHtml(t(dayTypeLabels[plan.dayType]))}</p>
        <button class="ghost-button" type="button" data-open-lunch-week data-member="${escapeHtml(member.id)}" data-date="${dateKey}">${escapeHtml(t("lunchChangePlan"))}</button>
      </article>`;
    }
    const complete = lunchPlanComplete(plan) && planIsSafeFor(member.id, plan);
    const ready = plan.approved && complete;
    return `<article class="tomorrow-lunch-card${ready ? " is-approved" : ""}${complete ? "" : " has-missing"}">
      <div class="lunch-card-heading"><div><h3>${escapeHtml(member.name)}</h3><p>${escapeHtml(formatDate(dateKey))}</p></div>${ready ? `<span class="lunch-approved">${escapeHtml(t("lunchApproved"))}</span>` : ""}</div>
      <ol class="lunch-summary-list">${planFoodList(plan)}</ol>
      ${complete ? "" : `<p class="lunch-safety-note">${escapeHtml(t("lunchNeedsSafeOption"))}</p>`}
      <div class="lunch-card-actions">
        <button class="ghost-button" type="button" data-edit-lunch="${escapeHtml(member.id)}" data-date="${dateKey}">${escapeHtml(t("lunchSwapSomething"))}</button>
        <button class="primary-action" type="button" data-approve-lunch="${escapeHtml(member.id)}" data-date="${dateKey}"${complete ? "" : " disabled"}>${escapeHtml(ready ? t("lunchUpdateGroceries") : t("lunchLooksGood"))}</button>
      </div>
    </article>`;
  }

  function noChildren() {
    return `<section class="lunch-empty-state">
      <div class="lunch-empty-plate" aria-hidden="true"><span></span></div>
      <h3>${escapeHtml(t("lunchNoChildrenHeading"))}</h3>
      <p>${escapeHtml(t("lunchNoChildrenCopy"))}</p>
      <button class="primary-action" type="button" data-open-family>${escapeHtml(t("lunchAddChild"))}</button>
    </section>`;
  }

  function homeContent() {
    const members = children();
    if (!members.length) return noChildren();
    const dateKey = nextSchoolDateKey();
    const approved = members.some((member) => state().plans[dateKey]?.[member.id]?.approved
      && planIsSafeFor(member.id, state().plans[dateKey][member.id]));
    return `<div class="lunch-home">
      <header class="lunch-hero">
        <div><p>${escapeHtml(formatDate(dateKey, { month: true }))}</p><h2>${escapeHtml(t("lunchTomorrowHeading"))}</h2></div>
        <div class="lunch-hero-tray" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
      </header>
      <div class="tomorrow-lunches">${members.map((member) => lunchCard(member, dateKey)).join("")}</div>
      <div class="lunch-home-actions">
        <button class="primary-action lunch-week-action" type="button" data-lunch-mode="week">${sparkleIcon()}${escapeHtml(t("lunchPlanWeek"))}</button>
        ${approved ? `<button class="ghost-button" type="button" data-open-packing data-date="${dateKey}">${escapeHtml(t("lunchPackTomorrow"))}</button>` : ""}
      </div>
    </div>`;
  }

  function settingControls(memberId) {
    const settings = memberSettings(memberId);
    return `<details class="lunch-conditions">
      <summary>${escapeHtml(t("lunchPackingConditions"))}</summary>
      <div class="lunch-condition-fields">
        <label><span>${escapeHtml(t("lunchPrepTime"))}</span><select data-lunch-setting="maxPrepMinutes" data-member="${escapeHtml(memberId)}">
          ${[5, 10, 15].map((minutes) => `<option value="${minutes}"${settings.maxPrepMinutes === minutes ? " selected" : ""}>${minutes} ${escapeHtml(t("minutesUnit"))}</option>`).join("")}
        </select></label>
        <label class="lunch-check-setting"><input type="checkbox" data-lunch-setting="coldPack" data-member="${escapeHtml(memberId)}"${settings.coldPack ? " checked" : ""}/><span>${escapeHtml(t("lunchColdPack"))}</span></label>
        <label class="lunch-check-setting"><input type="checkbox" data-lunch-setting="reheat" data-member="${escapeHtml(memberId)}"${settings.reheat ? " checked" : ""}/><span>${escapeHtml(t("lunchReheat"))}</span></label>
      </div>
    </details>`;
  }

  function builderSlot(component, foodId) {
    const food = lunchFoodById(foodId);
    return `<article class="lunch-component-card lunch-component-${component}">
      <div class="lunch-component-art">${foodArt(food || { component })}</div>
      <div class="lunch-component-copy"><span>${escapeHtml(t(componentLabels[component]))}</span><h3>${escapeHtml(foodName(foodId))}</h3></div>
      <button class="lunch-swap-button" type="button" data-swap-component="${component}">${escapeHtml(t("lunchSwap"))}</button>
    </article>`;
  }

  function swapPanel() {
    if (!builder || !swapComponent) return "";
    const currentId = builder.plan.components[swapComponent];
    const alternatives = lunchCatalog.filter((food) => (food.component === swapComponent || food.also?.includes(swapComponent))
      && food.id !== currentId
      && foodAllowedFor(builder.memberId, food));
    return `<section class="lunch-swap-panel" aria-labelledby="lunchSwapHeading">
      <div class="lunch-swap-heading"><div><h3 id="lunchSwapHeading" tabindex="-1">${escapeHtml(t("lunchEasySwaps"))}</h3><p>${escapeHtml(t("lunchEasySwapsCopy").replace("{food}", foodName(currentId)))}</p></div><button class="text-button" type="button" data-close-swap>${escapeHtml(t("close"))}</button></div>
      <div class="lunch-alternatives">${alternatives.length ? alternatives.map((food) => {
        const preference = lunchPreferenceFor(state(), builder.memberId, food.id);
        return `<article class="lunch-alternative${preference?.rating === "never" ? " is-never" : ""}">
          <button class="lunch-alternative-select" type="button" data-select-food="${food.id}">${foodArt(food)}<strong>${escapeHtml(localize(food.name))}</strong></button>
          <div class="lunch-food-actions" role="group" aria-label="${escapeHtml(t("lunchPreferenceFor").replace("{food}", localize(food.name)))}">
            ${[["love", "lunchLoves"], ["eat", "lunchEats"], ["dislike", "lunchDislikes"], ["never", "lunchNever"]].map(([rating, label]) => `<button type="button" data-rate-food="${food.id}" data-rating="${rating}" aria-pressed="${preference?.rating === rating}">${escapeHtml(t(label))}</button>`).join("")}
            <button class="lunch-favorite-toggle" type="button" data-favorite-food="${food.id}" aria-pressed="${preference?.favorite === true}" aria-label="${escapeHtml(t("lunchFavoriteItem"))}">${heartIcon(preference?.favorite === true)}</button>
          </div>
        </article>`;
      }).join("") : `<p class="lunch-safety-note">${escapeHtml(t("lunchNoSafeAlternatives"))}</p>`}</div>
    </section>`;
  }

  function builderContent() {
    const member = childFor(builder?.memberId);
    if (!builder || !member) { builder = null; return homeContent(); }
    const plan = normalizeLunchPlan(builder.plan);
    const complete = lunchPlanComplete(plan);
    return `<section class="lunch-builder">
      <header class="lunch-builder-heading">
        <button class="text-button" type="button" data-close-builder>${escapeHtml(t("lunchBack"))}</button>
        <div><p>${escapeHtml(formatDate(builder.dateKey, { month: true }))}</p><h2 id="lunchBuilderHeading" tabindex="-1">${escapeHtml(t("lunchBuildFor").replace("{name}", member.name))}</h2></div>
        <button class="primary-action lunch-generate-action" type="button" data-generate-lunch>${sparkleIcon()}${escapeHtml(t("lunchMakeMe"))}</button>
      </header>
      ${settingControls(member.id)}
      <div class="lunch-component-stack">${lunchComponentKeys.map((component) => builderSlot(component, plan.components[component])).join("")}</div>
      ${swapPanel()}
      ${complete ? "" : `<p class="lunch-safety-note">${escapeHtml(t("lunchNeedsSafeOption"))}</p>`}
      <div class="lunch-builder-actions">
        <button class="ghost-button" type="button" data-save-combination>${escapeHtml(t("lunchSaveFavorite"))}</button>
        <button class="ghost-button" type="button" data-save-builder>${escapeHtml(t("lunchSave"))}</button>
        <button class="primary-action" type="button" data-approve-builder${complete ? "" : " disabled"}>${escapeHtml(t("lunchLooksGood"))}</button>
      </div>
    </section>`;
  }

  function weekContent() {
    const members = children();
    if (!members.length) return noChildren();
    const dateKeys = schoolWeekDateKeys();
    return `<section class="lunch-week">
      <header class="lunch-section-heading"><div><h2>${escapeHtml(t("lunchWeekHeading"))}</h2><p>${escapeHtml(t("lunchWeekCopy"))}</p></div><button class="primary-action" type="button" data-fill-week>${sparkleIcon()}${escapeHtml(t("lunchFillWeek"))}</button></header>
      <div class="lunch-week-days">${dateKeys.map((dateKey) => `<section class="lunch-week-day">
        <h3><span>${escapeHtml(formatDate(dateKey, { short: true }))}</span><strong>${escapeHtml(new Intl.DateTimeFormat(getLang() === "es" ? "es-US" : "en-US", { month: "short", day: "numeric" }).format(new Date(`${dateKey}T12:00:00`)))}</strong></h3>
        <div>${members.map((member) => {
          const plan = state().plans[dateKey]?.[member.id];
          const effective = plan || generatedPlan(member.id, dateKey);
          const main = effective.dayType === "pack" ? foodName(effective.components.main) : t(dayTypeLabels[effective.dayType]);
          return `<article class="lunch-week-cell"><button type="button" data-edit-lunch="${member.id}" data-date="${dateKey}"><span>${escapeHtml(member.name)}</span><strong>${escapeHtml(main)}</strong></button><label><span class="visually-hidden">${escapeHtml(t("lunchDayTypeFor").replace("{name}", member.name))}</span><select data-day-type data-member="${member.id}" data-date="${dateKey}">${Object.entries(dayTypeLabels).map(([value, label]) => `<option value="${value}"${effective.dayType === value ? " selected" : ""}>${escapeHtml(t(label))}</option>`).join("")}</select></label></article>`;
        }).join("")}</div>
      </section>`).join("")}</div>
    </section>`;
  }

  function ideaCard(idea) {
    const label = childFor(ideaMemberId)?.name || t("lunchAChild");
    return `<article class="lunch-idea-card">
      <div class="lunch-idea-art" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
      <div><h3>${escapeHtml(localize(idea.name))}</h3><ul>${lunchComponentKeys.map((component) => `<li>${escapeHtml(foodName(idea.components[component]))}</li>`).join("")}</ul></div>
      <button class="primary-action" type="button" data-use-idea="${idea.id}">${escapeHtml(t("lunchUseIdea").replace("{name}", label))}</button>
    </article>`;
  }

  function ideasContent() {
    const members = children();
    if (!members.length) return noChildren();
    ideaMemberId ||= members[0].id;
    ideaDateKey ||= nextSchoolDateKey();
    return `<section class="lunch-ideas">
      <header class="lunch-section-heading"><div><h2>${escapeHtml(t("lunchIdeasHeading"))}</h2><p>${escapeHtml(t("lunchIdeasCopy"))}</p></div></header>
      <div class="lunch-assignment-controls"><label><span>${escapeHtml(t("lunchForChild"))}</span><select id="lunchIdeaMember">${members.map((member) => `<option value="${member.id}"${member.id === ideaMemberId ? " selected" : ""}>${escapeHtml(member.name)}</option>`).join("")}</select></label><label><span>${escapeHtml(t("lunchForDay"))}</span><input id="lunchIdeaDate" type="date" value="${ideaDateKey}" /></label></div>
      <div class="lunch-idea-library">${completeLunchIdeas.map(ideaCard).join("")}</div>
    </section>`;
  }

  function automaticFavoriteCombinations(memberId) {
    const bySignature = new Map();
    Object.values(state().plans).forEach((plans) => {
      const plan = plans[memberId];
      if (!plan?.approved || plan.dayType !== "pack") return;
      const signature = lunchPlanSignature(plan);
      const current = bySignature.get(signature) || { count: 0, components: plan.components };
      bySignature.set(signature, { ...current, count: current.count + 1 });
    });
    return [...bySignature.values()].filter((entry) => entry.count >= 2).sort((left, right) => right.count - left.count);
  }

  function favoritesContent() {
    const members = children();
    if (!members.length) return noChildren();
    return `<section class="lunch-favorites">
      <header class="lunch-section-heading"><div><h2>${escapeHtml(t("lunchFavoritesHeading"))}</h2><p>${escapeHtml(t("lunchFavoritesCopy"))}</p></div></header>
      <div class="lunch-favorite-families">${members.map((member) => {
        const foods = lunchFavoritesFor(state(), member.id).slice(0, 8);
        const automatic = automaticFavoriteCombinations(member.id);
        const saved = state().savedLunches.filter((entry) => entry.memberId === member.id);
        const combinations = [...saved.map((entry) => ({ ...entry, manual: true })), ...automatic].slice(0, 6);
        return `<section class="lunch-family-favorites"><h3>${escapeHtml(t("lunchChildFavorites").replace("{name}", member.name))}</h3>
          ${foods.length ? `<div class="lunch-favorite-foods">${foods.map(({ food, count }) => `<span>${heartIcon(true)}${escapeHtml(localize(food.name))}${count > 1 ? `<small>×${count}</small>` : ""}</span>`).join("")}</div>` : `<p class="empty-state">${escapeHtml(t("lunchFavoritesEmpty"))}</p>`}
          ${combinations.length ? `<div class="lunch-saved-combinations">${combinations.map((entry) => `<button type="button" data-use-favorite="${escapeHtml(member.id)}" data-signature="${escapeHtml(lunchPlanSignature(entry))}"><strong>${escapeHtml(entry.name || t(entry.manual ? "lunchSavedCombination" : "lunchFrequentCombination"))}</strong><span>${lunchComponentKeys.map((key) => foodName(entry.components[key])).join(" · ")}</span></button>`).join("")}</div>` : ""}
        </section>`;
      }).join("")}</div>
    </section>`;
  }

  function packingContent() {
    const members = children();
    const dateKey = packing?.dateKey || nextSchoolDateKey();
    const eligible = members.filter((member) => state().plans[dateKey]?.[member.id]?.approved
      && state().plans[dateKey]?.[member.id]?.dayType === "pack"
      && planIsSafeFor(member.id, state().plans[dateKey][member.id]));
    const member = childFor(packing?.memberId) || eligible[0];
    if (!member) {
      packing = null;
      return `<section class="packing-mode"><button class="text-button" type="button" data-close-packing>${escapeHtml(t("lunchBack"))}</button><h2>${escapeHtml(t("lunchNothingToPack"))}</h2><p>${escapeHtml(t("lunchApproveFirst"))}</p></section>`;
    }
    packing = { dateKey, memberId: member.id };
    const plan = state().plans[dateKey][member.id];
    const allChecked = lunchComponentKeys.every((key) => plan.packedSlots.includes(key));
    return `<section class="packing-mode">
      <header><button class="text-button" type="button" data-close-packing>${escapeHtml(t("lunchBack"))}</button><p>${escapeHtml(formatDate(dateKey, { month: true }))}</p><h2>${escapeHtml(t("lunchPackHeading"))}</h2></header>
      ${eligible.length > 1 ? `<div class="packing-member-switch" role="tablist">${eligible.map((child) => `<button type="button" role="tab" data-pack-member="${child.id}" aria-selected="${child.id === member.id}">${escapeHtml(child.name)}</button>`).join("")}</div>` : ""}
      <h3>${escapeHtml(member.name)}</h3>
      <div class="packing-checklist">${planFoodList(plan, { checklist: true })}</div>
      <button class="primary-action packing-complete" type="button" data-pack-complete${allChecked ? "" : " disabled"}>${escapeHtml(plan.packedAt ? t("lunchPackedDone") : t("lunchPackedAction"))}</button>
    </section>`;
  }

  function navigation() {
    return `<nav class="lunch-navigation" aria-label="${escapeHtml(t("lunchNavigation"))}">${[["home", "lunchTomorrowTab"], ["week", "lunchWeekTab"], ["ideas", "lunchIdeasTab"], ["favorites", "lunchFavoritesTab"]].map(([key, label]) => `<button type="button" data-lunch-mode="${key}" class="${mode === key ? "active" : ""}" aria-current="${mode === key ? "page" : "false"}">${escapeHtml(t(label))}</button>`).join("")}</nav>`;
  }

  function render() {
    const root = $("#lunchesView");
    if (!root) return;
    const content = packing ? packingContent() : builder ? builderContent() : ({ home: homeContent, week: weekContent, ideas: ideasContent, favorites: favoritesContent }[mode] || homeContent)();
    root.innerHTML = `<div class="lunch-workspace">${packing || builder ? "" : `<div class="lunch-plan-bar"><button class="text-button" type="button" data-back-to-plan>${escapeHtml(t("lunchBackToPlan"))}</button></div>${navigation()}`}<div id="lunchContent" aria-live="polite">${content}</div><p class="lunch-status" id="lunchStatus" role="status"></p></div>`;
  }

  async function persist(next, { groceries = false } = {}) {
    setSchoolLunches(normalizeSchoolLunches(next));
    render();
    const saved = await saveSharedState();
    if (groceries) await syncApprovedLunchGroceries();
    const status = $("#lunchStatus");
    if (status) status.textContent = saved ? t(groceries ? "lunchSavedWithGroceries" : "lunchSavedStatus") : t("lunchSavedOffline");
  }

  function openBuilder(memberId, dateKey, plan = null) {
    const member = childFor(memberId);
    if (!member) return;
    builder = { memberId, dateKey, plan: safePlanFor(memberId, dateKey, plan || planFor(memberId, dateKey)) };
    swapComponent = "";
    packing = null;
    render();
    requestAnimationFrame(() => $("#lunchBuilderHeading")?.focus());
  }

  async function approve(memberId, dateKey, plan = null) {
    const safe = safePlanFor(memberId, dateKey, plan || planFor(memberId, dateKey));
    if (!lunchPlanComplete(safe)) {
      builder = { memberId, dateKey, plan: safe };
      render();
      const status = $("#lunchStatus");
      if (status) status.textContent = t("lunchNeedsSafeOption");
      return;
    }
    const approved = { ...safe, approved: true, packedSlots: [], packedAt: "" };
    const next = setLunchPlan(state(), dateKey, memberId, approved, getHouseholdMember());
    builder = null;
    swapComponent = "";
    await persist(next, { groceries: true });
  }

  function bind() {
    const root = $("#lunchesView");
    if (!root || root.dataset.bound === "true") return;
    root.dataset.bound = "true";
    root.addEventListener("click", async (event) => {
      const modeButton = event.target.closest("[data-lunch-mode]");
      if (modeButton) { mode = modeButton.dataset.lunchMode; builder = null; packing = null; render(); return; }
      if (event.target.closest("[data-open-family]")) { setView("family"); return; }
      if (event.target.closest("[data-back-to-plan]")) { setView("schedule"); return; }
      const edit = event.target.closest("[data-edit-lunch]");
      if (edit) { openBuilder(edit.dataset.editLunch, edit.dataset.date); return; }
      const openWeek = event.target.closest("[data-open-lunch-week]");
      if (openWeek) {
        mode = "week";
        builder = null;
        packing = null;
        render();
        requestAnimationFrame(() => [...root.querySelectorAll("[data-day-type]")]
          .find((select) => select.dataset.member === openWeek.dataset.member && select.dataset.date === openWeek.dataset.date)?.focus());
        return;
      }
      const approveButton = event.target.closest("[data-approve-lunch]");
      if (approveButton) { await approve(approveButton.dataset.approveLunch, approveButton.dataset.date); return; }
      if (event.target.closest("[data-close-builder]")) {
        const returning = builder;
        builder = null;
        swapComponent = "";
        render();
        requestAnimationFrame(() => [...root.querySelectorAll("[data-edit-lunch]")]
          .find((button) => button.dataset.editLunch === returning?.memberId && button.dataset.date === returning?.dateKey)?.focus());
        return;
      }
      const swap = event.target.closest("[data-swap-component]");
      if (swap) { swapComponent = swap.dataset.swapComponent; render(); requestAnimationFrame(() => { $("#lunchSwapHeading")?.focus(); $("#lunchSwapHeading")?.scrollIntoView({ behavior: "smooth", block: "start" }); }); return; }
      if (event.target.closest("[data-close-swap]")) { const returning = swapComponent; swapComponent = ""; render(); requestAnimationFrame(() => root.querySelector(`[data-swap-component="${returning}"]`)?.focus()); return; }
      const select = event.target.closest("[data-select-food]");
      if (select && builder && swapComponent) { builder.plan = normalizeLunchPlan({ ...builder.plan, approved: false, components: { ...builder.plan.components, [swapComponent]: select.dataset.selectFood } }); swapComponent = ""; render(); return; }
      if (event.target.closest("[data-generate-lunch]") && builder) { builder.plan = generatedPlan(builder.memberId, builder.dateKey, builder.plan.components); swapComponent = ""; render(); return; }
      const rating = event.target.closest("[data-rate-food]");
      if (rating && builder) { const next = rateLunchFood(state(), builder.memberId, rating.dataset.rateFood, rating.dataset.rating, getHouseholdMember()); await persist(next); return; }
      const favorite = event.target.closest("[data-favorite-food]");
      if (favorite && builder) { const next = toggleLunchFoodFavorite(state(), builder.memberId, favorite.dataset.favoriteFood, getHouseholdMember()); await persist(next); return; }
      if (event.target.closest("[data-save-builder]") && builder) {
        const replacedApprovedPlan = state().plans[builder.dateKey]?.[builder.memberId]?.approved === true;
        const next = setLunchPlan(state(), builder.dateKey, builder.memberId, { ...builder.plan, approved: false }, getHouseholdMember());
        builder = null;
        await persist(next, { groceries: replacedApprovedPlan });
        return;
      }
      if (event.target.closest("[data-approve-builder]") && builder) { await approve(builder.memberId, builder.dateKey, builder.plan); return; }
      if (event.target.closest("[data-save-combination]") && builder) { const next = saveLunchCombination(state(), builder.memberId, builder.plan.components, "", getHouseholdMember()); await persist(next); return; }
      if (event.target.closest("[data-fill-week]")) {
        const memberList = children();
        const next = generateLunchWeek({ state: state(), members: memberList, dateKeys: schoolWeekDateKeys(), restrictionsByMember: getRestrictionsByMember(), contextForDate: (dateKey) => getLunchContext(dateKey), settingsByMember: state().settings });
        await persist(next);
        return;
      }
      const idea = event.target.closest("[data-use-idea]");
      if (idea) { const selected = completeLunchIdeas.find((entry) => entry.id === idea.dataset.useIdea); if (selected) openBuilder(ideaMemberId, ideaDateKey, { dayType: "pack", components: selected.components }); return; }
      const savedFavorite = event.target.closest("[data-use-favorite]");
      if (savedFavorite) {
        const [main, produce, side, extra, drink] = savedFavorite.dataset.signature.split("|");
        openBuilder(savedFavorite.dataset.useFavorite, nextSchoolDateKey(), { dayType: "pack", components: { main, produce, side, extra, drink } });
        return;
      }
      const packingButton = event.target.closest("[data-open-packing]");
      if (packingButton) { packing = { dateKey: packingButton.dataset.date, memberId: "" }; builder = null; render(); return; }
      if (event.target.closest("[data-close-packing]")) { packing = null; render(); return; }
      const packMember = event.target.closest("[data-pack-member]");
      if (packMember && packing) { packing.memberId = packMember.dataset.packMember; render(); return; }
      const packSlot = event.target.closest("[data-pack-slot]");
      if (packSlot && packing) {
        const current = state().plans[packing.dateKey]?.[packing.memberId];
        if (!current) return;
        const slots = current.packedSlots.includes(packSlot.dataset.packSlot) ? current.packedSlots.filter((key) => key !== packSlot.dataset.packSlot) : [...current.packedSlots, packSlot.dataset.packSlot];
        await persist(setLunchPlan(state(), packing.dateKey, packing.memberId, { ...current, packedSlots: slots, packedAt: "" }, getHouseholdMember()));
        return;
      }
      if (event.target.closest("[data-pack-complete]") && packing) {
        const current = state().plans[packing.dateKey]?.[packing.memberId];
        if (!current || !lunchComponentKeys.every((key) => current.packedSlots.includes(key))) return;
        await persist(setLunchPlan(state(), packing.dateKey, packing.memberId, { ...current, packedAt: new Date().toISOString() }, getHouseholdMember()));
      }
    });
    root.addEventListener("change", async (event) => {
      if (event.target.id === "lunchIdeaMember") { ideaMemberId = event.target.value; render(); return; }
      if (event.target.id === "lunchIdeaDate") { ideaDateKey = event.target.value || nextSchoolDateKey(); render(); return; }
      if (event.target.matches("[data-day-type]")) { const next = setLunchDayType(state(), event.target.dataset.date, event.target.dataset.member, event.target.value, getHouseholdMember()); await persist(next, { groceries: true }); return; }
      if (event.target.matches("[data-lunch-setting]")) {
        const value = event.target.type === "checkbox" ? event.target.checked : Number(event.target.value);
        let next = setLunchSetting(state(), event.target.dataset.member, event.target.dataset.lunchSetting, value);
        const replacedApprovedPlan = Boolean(builder
          && next.plans[builder.dateKey]?.[builder.memberId]?.approved);
        setSchoolLunches(next);
        if (builder) {
          builder.plan = safePlanFor(builder.memberId, builder.dateKey, builder.plan);
          if (replacedApprovedPlan) {
            next = setLunchPlan(next, builder.dateKey, builder.memberId, builder.plan, getHouseholdMember());
            setSchoolLunches(next);
          }
        }
        await persist(next, { groceries: replacedApprovedPlan });
      }
    });
  }

  return { render, bind, openBuilder };
}
