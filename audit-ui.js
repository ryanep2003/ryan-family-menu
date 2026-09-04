import { displayHouseholdMember } from "./household-attribution.js";

export function createAuditUi({ $, t, escapeHtml, getHistory, onRestore }) {
  function formatWhen(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
  }
  function render() {
    const target = $("#householdHistory");
    if (!target) return;
    const history = getHistory() || { events: [], snapshots: [] };
    const events = (history.events || []).slice(0, 20);
    const snapshots = (history.snapshots || []).slice(0, 10);
    if (!events.length && !snapshots.length) {
      target.innerHTML = `<p class="empty-state">${escapeHtml(t("historyEmpty"))}</p>`;
      return;
    }
    const eventHtml = events.map((event) => `<article class="household-history-item"><strong>${escapeHtml(event.summary || t("historyChanged"))}</strong><span class="household-history-meta">${escapeHtml(t("historyBy").replace("{name}", displayHouseholdMember(event.actor, t) || event.actor).replace("{time}", formatWhen(event.updatedAt)))}</span></article>`).join("");
    const snapshotHtml = snapshots.map((snapshot) => `<article class="household-history-item household-history-restore"><div><strong>${escapeHtml(t("historySnapshot"))}</strong><span class="household-history-meta">${escapeHtml(t("historyBy").replace("{name}", displayHouseholdMember(snapshot.actor, t) || snapshot.actor).replace("{time}", formatWhen(snapshot.updatedAt)))}</span></div><button class="text-button" type="button" data-restore-snapshot="${escapeHtml(snapshot.id)}">${escapeHtml(t("restoreMenu"))}</button></article>`).join("");
    target.innerHTML = `${eventHtml}${snapshotHtml}`;
    target.querySelectorAll("[data-restore-snapshot]").forEach((button) => button.addEventListener("click", () => onRestore(button.dataset.restoreSnapshot)));
  }
  return { render };
}
