const MAX_AUDIT_EVENTS = 200;
const MAX_STATE_SNAPSHOTS = 10;

function cleanText(value, maxLength = 240) {
  return `${value || ""}`.trim().slice(0, maxLength);
}

function hasMealContent(meal) {
  return Boolean(meal && (
    (Array.isArray(meal.items) && meal.items.length)
    || meal.breakfast || meal.lunch || meal.lunchSalad || meal.dinner || meal.main || meal.side || meal.salad
    || meal.notes
  ));
}

export function hasPlannedMeals(state = {}) {
  return Object.values(state.schedule || {}).some(hasMealContent)
    || Object.values(state.calendarMeals || {}).some(hasMealContent);
}

function mealSummary(meal) {
  if (!hasMealContent(meal)) return null;
  const items = Array.isArray(meal.items) ? meal.items.map((item) => ({
    id: cleanText(item?.id, 160),
    period: cleanText(item?.period, 20),
    role: cleanText(item?.role, 20),
    recipeId: cleanText(item?.recipeId, 160),
    sourceType: cleanText(item?.sourceType, 20),
    servings: Number(item?.servings) || 0,
  })).filter((item) => item.id && item.recipeId) : [];
  return {
    items,
    legacy: Object.fromEntries(["breakfast", "lunch", "lunchSalad", "dinner", "main", "side", "salad"]
      .map((key) => [key, cleanText(meal?.[key], 160)]).filter(([, value]) => value)),
    notes: cleanText(meal.notes, 500),
  };
}

export function scheduleSummary(state = {}) {
  const dates = new Set([...Object.keys(state.schedule || {}), ...Object.keys(state.calendarMeals || {})]);
  return Object.fromEntries([...dates].sort().map((dateKey) => {
    const meal = state.calendarMeals?.[dateKey] || state.schedule?.[dateKey];
    return [dateKey, mealSummary(meal)];
  }).filter(([, meal]) => meal));
}

export function normalizeAuditEvents(value) {
  if (!Array.isArray(value)) return [];
  return value.map((event) => ({
    id: cleanText(event?.id, 160),
    action: cleanText(event?.action, 80) || "state-updated",
    actor: cleanText(event?.actor, 80) || "Family",
    updatedAt: cleanText(event?.updatedAt, 40),
    version: Number(event?.version) || 0,
    changedDates: Array.isArray(event?.changedDates) ? event.changedDates.map((date) => cleanText(date, 40)).filter(Boolean).slice(0, 100) : [],
    summary: cleanText(event?.summary, 240),
  })).filter((event) => event.id && event.updatedAt).slice(0, MAX_AUDIT_EVENTS);
}

export function normalizeStateSnapshots(value) {
  if (!Array.isArray(value)) return [];
  return value.map((snapshot) => ({
    id: cleanText(snapshot?.id, 160),
    actor: cleanText(snapshot?.actor, 80) || "Family",
    updatedAt: cleanText(snapshot?.updatedAt, 40),
    version: Number(snapshot?.version) || 0,
    weekStart: cleanText(snapshot?.weekStart, 20),
    schedule: snapshot?.schedule && typeof snapshot.schedule === "object" ? snapshot.schedule : {},
    calendarMeals: snapshot?.calendarMeals && typeof snapshot.calendarMeals === "object" ? snapshot.calendarMeals : {},
  })).filter((snapshot) => snapshot.id && snapshot.updatedAt).slice(0, MAX_STATE_SNAPSHOTS);
}

export function auditEvent({ action = "state-updated", actor = "Family", updatedAt = new Date().toISOString(), version = 0, before = {}, after = {}, summary = "" } = {}) {
  const beforeDates = scheduleSummary(before);
  const afterDates = scheduleSummary(after);
  const changedDates = [...new Set([...Object.keys(beforeDates), ...Object.keys(afterDates)])]
    .filter((dateKey) => JSON.stringify(beforeDates[dateKey]) !== JSON.stringify(afterDates[dateKey]));
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action: cleanText(action, 80),
    actor: cleanText(actor, 80) || "Family",
    updatedAt,
    version: Number(version) || 0,
    changedDates: changedDates.slice(0, 100),
    summary: cleanText(summary || `${changedDates.length} meal date${changedDates.length === 1 ? "" : "s"} changed.`),
  };
}

export function stateSnapshot({ state = {}, actor = "Family", version = 0, updatedAt = new Date().toISOString() } = {}) {
  return {
    id: `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    actor: cleanText(actor, 80) || "Family",
    updatedAt,
    version: Number(version) || 0,
    weekStart: cleanText(state.weekStart, 20),
    schedule: state.schedule && typeof state.schedule === "object" ? state.schedule : {},
    calendarMeals: state.calendarMeals && typeof state.calendarMeals === "object" ? state.calendarMeals : {},
  };
}

export { MAX_AUDIT_EVENTS, MAX_STATE_SNAPSHOTS };
