import { displayHouseholdMember } from "./household-attribution.js";

export function createActivityUi({ $, t, escapeHtml, getActivity }) {
  function renderActivity() {
    const target = $("#householdActivity");
    if (!target) return;
    const entries = getActivity().slice(0, 30);
    target.innerHTML = entries.length ? entries.map((entry) => {
      const when = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(entry.updatedAt));
      return `<article class="household-activity-item"><span class="activity-type activity-${escapeHtml(entry.type)}" aria-hidden="true"></span><div><strong>${escapeHtml(entry.label)}</strong><span>${escapeHtml(t("activityBy").replace("{name}", displayHouseholdMember(entry.updatedBy, t) || entry.updatedBy).replace("{time}", when))}</span></div></article>`;
    }).join("") : `<p class="empty-state">${t("activityEmpty")}</p>`;
  }
  return { renderActivity };
}
