import { normalizeDinnerEvent, normalizeDinnerEvents } from "./memory-logic.js";

export function correctedDinnerEvent(current, { outcome, reactions = {}, updatedBy = "Family", updatedAt = new Date().toISOString() }) {
  if (!current || !["loved", "worked", "mixed", "skip", "not-made"].includes(outcome)) return null;
  const allowed = new Set(["loved", "ate", "neutral", "disliked"]);
  const attendeeIds = new Set([...(current.attendeeIds || []), ...Object.keys(current.reactions || {})]);
  const cleanedReactions = Object.fromEntries(Object.entries(reactions)
    .filter(([id, reaction]) => attendeeIds.has(id) && allowed.has(reaction)));
  return normalizeDinnerEvent({
    ...current,
    status: outcome === "not-made" ? "skipped" : "cooked",
    outcome,
    reactions: cleanedReactions,
    updatedAt,
    updatedBy,
  });
}

export async function saveDinnerHistoryCorrection({ getJson, putJson, dateKey, expectedEvent, correction }) {
  const url = "/.netlify/functions/dinner-history";
  try {
    const fresh = await getJson(url, "Could not load dinner history.");
    const events = normalizeDinnerEvents(fresh.items);
    const current = events.find((event) => event.dateKey === dateKey);
    if (!current || JSON.stringify(current) !== JSON.stringify(normalizeDinnerEvent(expectedEvent))) {
      return { status: "stale" };
    }
    const next = correctedDinnerEvent(current, correction);
    if (!next || next.dateKey !== dateKey) return { status: "invalid" };
    const items = normalizeDinnerEvents([next, ...events.filter((event) => event.dateKey !== dateKey)]);
    const saved = await putJson(url, { items, version: fresh.version }, "Could not correct dinner history.");
    return { status: "saved", items: normalizeDinnerEvents(saved.items), version: saved.version };
  } catch (error) {
    return { status: error?.status === 409 ? "stale" : "unavailable" };
  }
}
