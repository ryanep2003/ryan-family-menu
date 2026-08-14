const MEMBER_ROLES = ["adult", "child"];
const PREFERENCE_KINDS = ["restriction", "dislike", "like", "reliable"];
const DINNER_STATUSES = ["cooked", "skipped", "takeout", "other"];
const DINNER_OUTCOMES = ["loved", "worked", "mixed", "skip", "not-made"];
const MEMBER_REACTIONS = ["loved", "ate", "neutral", "disliked"];
export const dinnerPaces = ["", "quick", "standard", "no-cooking"];

function cleanText(value, max = 160) {
  return `${value || ""}`.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanId(value, prefix = "item") {
  const id = cleanText(value, 160);
  return /^[a-z0-9-]{1,160}$/i.test(id)
    ? id
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function cleanTimestamp(value) {
  const timestamp = cleanText(value, 40);
  return timestamp && !Number.isNaN(new Date(timestamp).getTime()) ? timestamp : "";
}

export function normalizeFamilyMembers(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map((member) => {
    const name = cleanText(member?.name, 40);
    const id = cleanId(member?.id, "member");
    if (!name || seen.has(id)) return null;
    seen.add(id);
    return {
      id,
      name,
      role: MEMBER_ROLES.includes(member?.role) ? member.role : "adult",
      active: member?.active !== false,
      spiceTolerance: Math.min(3, Math.max(0, Math.round(Number(member?.spiceTolerance) || 0))),
      updatedAt: cleanTimestamp(member?.updatedAt),
      updatedBy: cleanText(member?.updatedBy, 80),
    };
  }).filter(Boolean).slice(0, 20);
}

export function familyMember(value = {}, updatedBy = "Family", timestamp = new Date().toISOString()) {
  return normalizeFamilyMembers([{
    id: value.id || `member-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: value.name,
    role: value.role,
    active: value.active,
    spiceTolerance: value.spiceTolerance,
    updatedAt: timestamp,
    updatedBy,
  }])[0] || null;
}

export function normalizeFamilyPreferences(value, members = []) {
  if (!Array.isArray(value)) return [];
  const memberIds = new Set(normalizeFamilyMembers(members).map((member) => member.id));
  const seen = new Set();
  return value.map((preference) => {
    const memberId = cleanText(preference?.memberId, 160);
    const kind = PREFERENCE_KINDS.includes(preference?.kind) ? preference.kind : "";
    const text = cleanText(preference?.value, 120);
    if (!memberIds.has(memberId) || !kind || !text) return null;
    const key = `${memberId}:${kind}:${text.toLocaleLowerCase()}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return {
      id: cleanId(preference?.id, "preference"),
      memberId,
      kind,
      value: text,
      updatedAt: cleanTimestamp(preference?.updatedAt),
      updatedBy: cleanText(preference?.updatedBy, 80),
    };
  }).filter(Boolean).slice(0, 300);
}

export function preferencesFromText(existing, members, memberId, kind, text, updatedBy = "Family", timestamp = new Date().toISOString()) {
  const retained = normalizeFamilyPreferences(existing, members)
    .filter((preference) => !(preference.memberId === memberId && preference.kind === kind));
  const incoming = `${text || ""}`.split(/[\n,]/).map((value) => cleanText(value, 120)).filter(Boolean)
    .map((value, index) => ({
      id: `preference-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      memberId,
      kind,
      value,
      updatedAt: timestamp,
      updatedBy,
    }));
  return [...retained, ...incoming];
}

export const defaultFamilyRules = {
  repeatDays: 14,
  maxWeeknightMinutes: 35,
  minKidSafeDinners: 2,
  maxPastaDinners: 2,
  preferLeftovers: true,
};

function boundedInteger(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

export function normalizeFamilyRules(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    repeatDays: boundedInteger(source.repeatDays, 0, 60, defaultFamilyRules.repeatDays),
    maxWeeknightMinutes: boundedInteger(source.maxWeeknightMinutes, 0, 240, defaultFamilyRules.maxWeeknightMinutes),
    minKidSafeDinners: boundedInteger(source.minKidSafeDinners, 0, 7, defaultFamilyRules.minKidSafeDinners),
    maxPastaDinners: boundedInteger(source.maxPastaDinners, 0, 7, defaultFamilyRules.maxPastaDinners),
    preferLeftovers: source.preferLeftovers !== false,
    updatedAt: cleanTimestamp(source.updatedAt),
    updatedBy: cleanText(source.updatedBy, 80),
  };
}

export function normalizeDinnerPace(value) {
  return dinnerPaces.includes(value) ? value : "";
}

export function normalizeDinnerEvent(value) {
  const dateKey = cleanDate(value?.dateKey);
  if (!dateKey) return null;
  const status = DINNER_STATUSES.includes(value?.status) ? value.status : "cooked";
  const outcome = DINNER_OUTCOMES.includes(value?.outcome) ? value.outcome : "";
  const items = Array.isArray(value?.items) ? value.items.map((item) => {
    const recipeId = cleanText(item?.recipeId, 160);
    if (!recipeId) return null;
    return {
      id: cleanId(item?.id, "meal-item"),
      recipeId,
      name: cleanText(item?.name, 160),
      role: cleanText(item?.role, 30),
    };
  }).filter(Boolean).slice(0, 20) : [];
  const reactions = Object.fromEntries(Object.entries(value?.reactions || {}).map(([memberId, reaction]) => [
    cleanText(memberId, 160),
    MEMBER_REACTIONS.includes(reaction) ? reaction : "",
  ]).filter(([memberId, reaction]) => memberId && reaction).slice(0, 20));
  const leftovers = Object.fromEntries(Object.entries(value?.leftovers || {}).map(([itemId, amount]) => [
    cleanText(itemId, 160),
    Math.min(100, Math.max(0, Math.round((Number(amount) || 0) * 2) / 2)),
  ]).filter(([itemId]) => itemId).slice(0, 20));
  return {
    id: cleanId(value?.id || `dinner-${dateKey}`, "dinner"),
    dateKey,
    status,
    outcome: status === "cooked" ? outcome : outcome || "not-made",
    pace: normalizeDinnerPace(value?.pace),
    items,
    attendeeIds: [...new Set(Array.isArray(value?.attendeeIds) ? value.attendeeIds.map((id) => cleanText(id, 160)).filter(Boolean) : [])].slice(0, 20),
    reactions,
    leftovers,
    note: cleanText(value?.note, 500),
    updatedAt: cleanTimestamp(value?.updatedAt) || new Date().toISOString(),
    updatedBy: cleanText(value?.updatedBy, 80) || "Family",
  };
}

export function normalizeDinnerEvents(value) {
  if (!Array.isArray(value)) return [];
  const byDate = new Map();
  value.forEach((candidate) => {
    const event = normalizeDinnerEvent(candidate);
    if (!event) return;
    const current = byDate.get(event.dateKey);
    if (!current || event.updatedAt > current.updatedAt) byDate.set(event.dateKey, event);
  });
  return [...byDate.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey)).slice(0, 1000);
}

export function upsertDinnerEvent(events, event) {
  const normalized = normalizeDinnerEvent(event);
  if (!normalized) return normalizeDinnerEvents(events);
  return normalizeDinnerEvents([normalized, ...normalizeDinnerEvents(events).filter((item) => item.dateKey !== normalized.dateKey)]);
}

export function dinnerEventFromMeal({ dateKey, meal, recipes = [], outcome, updatedBy, memberIds = [] }) {
  const normalizedOutcome = DINNER_OUTCOMES.includes(outcome) ? outcome : "worked";
  const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const items = (meal?.items || []).filter((item) => item.period === "dinner").map((item) => ({
    id: item.id,
    recipeId: item.recipeId,
    name: recipeMap.get(item.recipeId)?.name?.en || recipeMap.get(item.recipeId)?.name || "",
    role: item.role,
  }));
  return normalizeDinnerEvent({
    id: `dinner-${dateKey}`,
    dateKey,
    status: normalizedOutcome === "not-made" ? "skipped" : "cooked",
    outcome: normalizedOutcome,
    pace: meal?.dinnerPace,
    items,
    attendeeIds: memberIds,
    leftovers: meal?.servingPlan?.actualLeftovers || {},
    updatedAt: new Date().toISOString(),
    updatedBy,
  });
}

function recipeSearchText(recipe) {
  const values = [
    recipe?.id,
    recipe?.category,
    recipe?.name?.en,
    recipe?.name?.es,
    recipe?.name,
    recipe?.ingredientsText?.en,
    recipe?.ingredientsText?.es,
    recipe?.ingredientsText,
    ...(Array.isArray(recipe?.ingredients?.en) ? recipe.ingredients.en : []),
    ...(Array.isArray(recipe?.ingredients?.es) ? recipe.ingredients.es : []),
    recipe?.allergyWarning?.en,
    recipe?.allergyWarning?.es,
    recipe?.allergyWarning,
  ];
  return values.filter((value) => typeof value === "string").join(" ").toLocaleLowerCase();
}

export function recommendationForRecipe(recipe, { events = [], members = [], preferences = [], rules = defaultFamilyRules, recipeFeedback = {}, dateKey = "" } = {}) {
  const normalizedMembers = normalizeFamilyMembers(members);
  const normalizedPreferences = normalizeFamilyPreferences(preferences, normalizedMembers);
  const normalizedRules = normalizeFamilyRules(rules);
  const text = recipeSearchText(recipe);
  const matchingEvents = normalizeDinnerEvents(events).filter((event) => event.items.some((item) => item.recipeId === recipe?.id));
  const reasons = [];
  let score = 0;
  const blocked = normalizedPreferences.filter((preference) => preference.kind === "restriction")
    .some((preference) => text.includes(preference.value.toLocaleLowerCase()));
  if (blocked) return { score: -10000, blocked: true, reasons: ["restriction"] };
  const disliked = normalizedPreferences.some((preference) => preference.kind === "dislike"
    && text.includes(preference.value.toLocaleLowerCase()));
  if (disliked) {
    score -= 6;
    reasons.push("disliked");
  }
  const likedPreference = normalizedPreferences.some((preference) => preference.kind === "like"
    && text.includes(preference.value.toLocaleLowerCase()));
  if (likedPreference) {
    score += 2;
    reasons.push("preference");
  }
  const reliable = normalizedPreferences.some((preference) => preference.kind === "reliable"
    && (preference.value === recipe?.id || text.includes(preference.value.toLocaleLowerCase())));
  if (reliable) {
    score += 8;
    reasons.push("reliable");
  }
  matchingEvents.forEach((event) => {
    score += ({ loved: 5, worked: 2, mixed: -1, skip: -7, "not-made": 0 }[event.outcome] || 0);
  });
  const legacy = recipeFeedback?.[recipe?.id];
  if (legacy) score += (Number(legacy.loved) || 0) * 2 + (Number(legacy.repeat) || 0) - (Number(legacy.skip) || 0) * 4;
  if (!matchingEvents.length && (Number(legacy?.loved) || 0) > 0) reasons.push("liked");
  if (matchingEvents.some((event) => event.outcome === "loved")) reasons.push("liked");
  const last = matchingEvents[0];
  if (last && dateKey) {
    const daysSince = Math.floor((new Date(`${dateKey}T12:00:00`) - new Date(`${last.dateKey}T12:00:00`)) / 86400000);
    if (daysSince >= 0 && daysSince < normalizedRules.repeatDays) {
      score -= 10;
      reasons.push("recent");
    } else if (daysSince >= normalizedRules.repeatDays) reasons.push("notRecent");
  }
  return { score, blocked: false, reasons: [...new Set(reasons)] };
}

export function rankedRecipes(recipes, context = {}) {
  return recipes.map((recipe) => ({ recipe, recommendation: recommendationForRecipe(recipe, context) }))
    .filter(({ recommendation }) => !recommendation.blocked)
    .sort((a, b) => b.recommendation.score - a.recommendation.score || `${a.recipe?.id}`.localeCompare(`${b.recipe?.id}`));
}
