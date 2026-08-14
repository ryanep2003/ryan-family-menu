import {
  dinnerEventFromMeal,
  familyMember,
  normalizeDinnerEvent,
  normalizeFamilyMembers,
  normalizeFamilyPreferences,
  normalizeFamilyRules,
  preferencesFromText,
  upsertDinnerEvent,
} from "./memory-logic.js";

const preferenceKinds = ["restriction", "dislike", "like", "reliable"];
const outcomes = ["loved", "worked", "mixed", "skip", "not-made"];
const reactions = ["", "loved", "ate", "neutral", "disliked"];

export function createFamilyUi({
  $,
  $$,
  t,
  escapeHtml,
  localize,
  formatDateKey,
  getHouseholdMember,
  setHouseholdMember,
  getFamilyMembers,
  setFamilyMembers,
  getFamilyPreferences,
  setFamilyPreferences,
  getFamilyRules,
  setFamilyRules,
  getDinnerEvents,
  setDinnerEvents,
  getTodaysMeal,
  recipeById,
  allRecipes,
  saveSharedState,
  saveDinnerEvents,
  recordDinnerOutcome,
  renderApp,
  setView,
  getLang,
}) {
  const preferenceText = (memberId, kind) => getFamilyPreferences()
    .filter((preference) => preference.memberId === memberId && preference.kind === kind)
    .map((preference) => preference.value).join(", ");

  function updateMemberSuggestions() {
    const members = normalizeFamilyMembers(getFamilyMembers()).filter((member) => member.active);
    const datalist = $("#householdMemberSuggestions");
    if (datalist) datalist.innerHTML = ["Family", ...members.map((member) => member.name)]
      .map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
  }

  function renderMembers() {
    const members = normalizeFamilyMembers(getFamilyMembers());
    const container = $("#familyMembersList");
    if (!container) return;
    container.innerHTML = members.length ? members.map((member) => `
      <form class="family-member-card${member.active ? "" : " archived"}" data-family-member-form="${escapeHtml(member.id)}">
        <div class="family-member-heading">
          <div>
            <strong>${escapeHtml(member.name)}</strong>
            <span>${escapeHtml(t(member.role === "child" ? "familyRoleChild" : "familyRoleAdult"))}</span>
          </div>
          <button class="text-button" type="button" data-toggle-family-member="${escapeHtml(member.id)}">${escapeHtml(t(member.active ? "archiveMember" : "restoreMember"))}</button>
        </div>
        <div class="family-member-basics">
          <label><span>${escapeHtml(t("memberName"))}</span><input name="name" maxlength="40" value="${escapeHtml(member.name)}" required /></label>
          <label><span>${escapeHtml(t("memberRole"))}</span><select name="role"><option value="adult"${member.role === "adult" ? " selected" : ""}>${escapeHtml(t("familyRoleAdult"))}</option><option value="child"${member.role === "child" ? " selected" : ""}>${escapeHtml(t("familyRoleChild"))}</option></select></label>
          <label><span>${escapeHtml(t("spiceTolerance"))}</span><select name="spiceTolerance">${[0, 1, 2, 3].map((level) => `<option value="${level}"${member.spiceTolerance === level ? " selected" : ""}>${escapeHtml(t(`spiceLevel${level}`))}</option>`).join("")}</select></label>
        </div>
        <div class="family-preference-grid">
          ${preferenceKinds.map((kind) => `<label><span>${escapeHtml(t(`preference${kind[0].toUpperCase()}${kind.slice(1)}`))}</span><textarea name="preference-${kind}" rows="2" placeholder="${escapeHtml(t(`preference${kind[0].toUpperCase()}${kind.slice(1)}Placeholder`))}">${escapeHtml(preferenceText(member.id, kind))}</textarea></label>`).join("")}
        </div>
        <p class="field-note">${escapeHtml(t("preferenceCommaNote"))}</p>
        <div class="family-member-actions"><button class="primary-action compact-button" type="submit">${escapeHtml(t("saveMember"))}</button><span role="status" data-member-status="${escapeHtml(member.id)}"></span></div>
      </form>
    `).join("") : `<div class="family-empty"><h3>${escapeHtml(t("familyMembersEmptyHeading"))}</h3><p>${escapeHtml(t("familyMembersEmpty"))}</p></div>`;
    updateMemberSuggestions();
  }

  function renderRules() {
    const rules = normalizeFamilyRules(getFamilyRules());
    const form = $("#familyRulesForm");
    if (!form) return;
    form.repeatDays.value = rules.repeatDays;
    form.maxWeeknightMinutes.value = rules.maxWeeknightMinutes;
    form.minKidSafeDinners.value = rules.minKidSafeDinners;
    form.maxPastaDinners.value = rules.maxPastaDinners;
    form.preferLeftovers.checked = rules.preferLeftovers;
  }

  function outcomeLabel(event) {
    if (!event) return "";
    return t(`dinnerOutcome${event.outcome.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join("")}`);
  }

  function renderHistory() {
    const container = $("#pastDinnersList");
    if (!container) return;
    const events = getDinnerEvents().slice(0, 30);
    if (!events.length) {
      container.innerHTML = `<div class="family-empty"><h3>${escapeHtml(t("pastDinnersEmptyHeading"))}</h3><p>${escapeHtml(t("pastDinnersEmpty"))}</p></div>`;
      return;
    }
    const formatter = new Intl.DateTimeFormat(getLang() === "es" ? "es-US" : "en-US", { weekday: "short", month: "short", day: "numeric" });
    container.innerHTML = events.map((event) => {
      const names = event.items.map((item) => localize(recipeById(item.recipeId)?.name) || item.name).filter(Boolean);
      const leftoverTotal = Object.values(event.leftovers || {}).reduce((sum, amount) => sum + Number(amount || 0), 0);
      return `<article class="past-dinner-item">
        <div><time datetime="${event.dateKey}">${escapeHtml(formatter.format(new Date(`${event.dateKey}T12:00:00`)))}</time><strong>${escapeHtml(names.join(" · ") || t("dinnerChangedPlans"))}</strong></div>
        <div class="past-dinner-meta"><span>${escapeHtml(outcomeLabel(event))}</span>${leftoverTotal ? `<span>${escapeHtml(t("leftoverCount").replace("{count}", leftoverTotal))}</span>` : ""}<span>${escapeHtml(t("updatedByShort").replace("{name}", event.updatedBy))}</span></div>
      </article>`;
    }).join("");
  }

  function renderFamily() {
    renderMembers();
    renderRules();
    renderHistory();
  }

  function todayDinnerItems() {
    return (getTodaysMeal()?.items || []).filter((item) => item.period === "dinner");
  }

  function detailsMarkup(event, members) {
    return `<details class="dinner-feedback-details"${event.note || Object.keys(event.reactions || {}).length ? " open" : ""}>
      <summary>${escapeHtml(t("addDinnerDetails"))}</summary>
      <form id="dinnerFeedbackDetailsForm">
        <fieldset><legend>${escapeHtml(t("whoAteDinner"))}</legend><div class="dinner-attendees">${members.map((member) => `
          <label><input type="checkbox" name="attendee" value="${escapeHtml(member.id)}"${event.attendeeIds.includes(member.id) ? " checked" : ""} /><span>${escapeHtml(member.name)}</span></label>
        `).join("")}</div></fieldset>
        ${members.map((member) => `<label class="member-reaction"><span>${escapeHtml(t("memberReaction").replace("{name}", member.name))}</span><select name="reaction-${escapeHtml(member.id)}">${reactions.map((reaction) => `<option value="${reaction}"${event.reactions?.[member.id] === reaction ? " selected" : ""}>${escapeHtml(reaction ? t(`reaction${reaction[0].toUpperCase()}${reaction.slice(1)}`) : t("reactionNotRecorded"))}</option>`).join("")}</select></label>`).join("")}
        ${event.items.length ? `<fieldset><legend>${escapeHtml(t("actualLeftoversHeading"))}</legend><div class="dinner-leftovers">${event.items.map((item) => `<label><span>${escapeHtml(localize(recipeById(item.recipeId)?.name) || item.name)}</span><input type="number" min="0" max="100" step="0.5" name="leftover-${escapeHtml(item.id)}" value="${event.leftovers?.[item.id] || 0}" /></label>`).join("")}</div></fieldset>` : ""}
        <label><span>${escapeHtml(t("dinnerNote"))}</span><textarea name="note" maxlength="500" rows="2" placeholder="${escapeHtml(t("dinnerNotePlaceholder"))}">${escapeHtml(event.note || "")}</textarea></label>
        <button class="primary-action" type="submit">${escapeHtml(t("saveDinnerDetails"))}</button><p class="form-status" id="dinnerFeedbackStatus" role="status"></p>
      </form>
    </details>`;
  }

  function renderTodayFeedback() {
    const panel = $("#dinnerFeedback");
    if (!panel) return;
    const dateKey = formatDateKey(new Date());
    const dinnerItems = todayDinnerItems();
    if (!dinnerItems.length) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }
    const event = getDinnerEvents().find((item) => item.dateKey === dateKey);
    const members = normalizeFamilyMembers(getFamilyMembers()).filter((member) => member.active);
    panel.hidden = false;
    panel.innerHTML = `<div class="dinner-feedback-heading"><div><h2>${escapeHtml(t("dinnerFeedbackHeading"))}</h2><p>${escapeHtml(event ? t("dinnerFeedbackSaved") : t("dinnerFeedbackHelper"))}</p></div>${event ? `<span class="dinner-memory-state">${escapeHtml(outcomeLabel(event))}</span>` : ""}</div>
      <div class="dinner-outcome-options" role="group" aria-label="${escapeHtml(t("dinnerFeedbackHeading"))}">${outcomes.map((outcome) => `<button type="button" data-dinner-outcome="${outcome}" aria-pressed="${event?.outcome === outcome}">${escapeHtml(t(`dinnerOutcome${outcome.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join("")}`))}</button>`).join("")}</div>
      ${event ? detailsMarkup(event, members) : `<p class="dinner-feedback-note">${escapeHtml(t("dinnerDetailsOptional"))}</p>`}`;
    bindTodayFeedback();
  }

  function bindTodayFeedback() {
    $$('[data-dinner-outcome]').forEach((button) => button.addEventListener("click", async () => {
      const dateKey = formatDateKey(new Date());
      const meal = getTodaysMeal();
      const members = normalizeFamilyMembers(getFamilyMembers()).filter((member) => member.active);
      const current = getDinnerEvents().find((event) => event.dateKey === dateKey);
      const next = dinnerEventFromMeal({
        dateKey,
        meal,
        recipes: allRecipes(),
        outcome: button.dataset.dinnerOutcome,
        updatedBy: getHouseholdMember(),
        memberIds: current?.attendeeIds?.length ? current.attendeeIds : members.map((member) => member.id),
      });
      if (current) Object.assign(next, { reactions: current.reactions, leftovers: current.leftovers, note: current.note });
      setDinnerEvents(upsertDinnerEvent(getDinnerEvents(), next));
      recordDinnerOutcome(next, current);
      renderApp();
      await Promise.all([saveDinnerEvents(), saveSharedState()]);
    }));
    const form = $("#dinnerFeedbackDetailsForm");
    if (form) form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const dateKey = formatDateKey(new Date());
      const current = getDinnerEvents().find((item) => item.dateKey === dateKey);
      if (!current) return;
      const data = new FormData(form);
      const next = normalizeDinnerEvent({
        ...current,
        attendeeIds: data.getAll("attendee"),
        reactions: Object.fromEntries(normalizeFamilyMembers(getFamilyMembers()).map((member) => [member.id, data.get(`reaction-${member.id}`)]).filter(([, reaction]) => reaction)),
        leftovers: Object.fromEntries(current.items.map((item) => [item.id, Number(data.get(`leftover-${item.id}`)) || 0])),
        note: data.get("note"),
        updatedAt: new Date().toISOString(),
        updatedBy: getHouseholdMember(),
      });
      setDinnerEvents(upsertDinnerEvent(getDinnerEvents(), next));
      renderApp();
      const saved = await saveDinnerEvents();
      const status = $("#dinnerFeedbackStatus");
      if (status) status.textContent = t(saved ? "dinnerDetailsSaved" : "dinnerDetailsPending");
    });
  }

  function bind() {
    $("#openFamily")?.addEventListener("click", () => {
      $(".household-menu").open = false;
      setView("family");
      renderFamily();
    });
    $("#closeFamily")?.addEventListener("click", () => setView("today"));
    $("#addFamilyMemberForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const member = familyMember({ name: data.get("name"), role: data.get("role"), active: true }, getHouseholdMember());
      if (!member) return;
      setFamilyMembers([...getFamilyMembers(), member]);
      event.currentTarget.reset();
      renderApp();
      await saveSharedState();
    });
    $("#familyRulesForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      setFamilyRules(normalizeFamilyRules({
        repeatDays: data.get("repeatDays"),
        maxWeeknightMinutes: data.get("maxWeeknightMinutes"),
        minKidSafeDinners: data.get("minKidSafeDinners"),
        maxPastaDinners: data.get("maxPastaDinners"),
        preferLeftovers: data.get("preferLeftovers") === "on",
        updatedAt: new Date().toISOString(),
        updatedBy: getHouseholdMember(),
      }));
      const saved = await saveSharedState();
      $("#familyRulesStatus").textContent = t(saved ? "familyRulesSaved" : "familyRulesPending");
    });
    $("#familyMembersList")?.addEventListener("submit", async (event) => {
      const form = event.target.closest("[data-family-member-form]");
      if (!form) return;
      event.preventDefault();
      const memberId = form.dataset.familyMemberForm;
      const data = new FormData(form);
      const members = getFamilyMembers().map((member) => member.id === memberId ? familyMember({
        ...member,
        name: data.get("name"),
        role: data.get("role"),
        spiceTolerance: data.get("spiceTolerance"),
      }, getHouseholdMember()) : member);
      let preferences = getFamilyPreferences();
      preferenceKinds.forEach((kind) => {
        preferences = preferencesFromText(preferences, members, memberId, kind, data.get(`preference-${kind}`), getHouseholdMember());
      });
      setFamilyMembers(members);
      setFamilyPreferences(normalizeFamilyPreferences(preferences, members));
      renderApp();
      const saved = await saveSharedState();
      const status = $(`[data-member-status="${memberId}"]`);
      if (status) status.textContent = t(saved ? "memberSaved" : "memberSavePending");
    });
    $("#familyMembersList")?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-toggle-family-member]");
      if (!button) return;
      const id = button.dataset.toggleFamilyMember;
      const members = getFamilyMembers().map((member) => member.id === id ? { ...member, active: !member.active, updatedAt: new Date().toISOString(), updatedBy: getHouseholdMember() } : member);
      setFamilyMembers(members);
      const activeNames = new Set(members.filter((member) => member.active).map((member) => member.name));
      if (!activeNames.has(getHouseholdMember()) && getHouseholdMember() !== "Family") setHouseholdMember("Family");
      renderApp();
      await saveSharedState();
    });
  }

  return { bind, renderFamily, renderTodayFeedback, updateMemberSuggestions };
}
