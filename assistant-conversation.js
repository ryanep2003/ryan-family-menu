import { budgetForMonth } from "./budget-logic.js";
import { lunchFoodById } from "./lunch-logic.js";
import { ASSISTANT_PROPOSAL_TYPES, normalizeAssistantProposal } from "./assistant-proposals.js";

const MAX_SOURCES = 48;
const MAX_SOURCE_TEXT = 900;
const MAX_HISTORY = 6;
const MAX_MESSAGE_CHARS = 600;

export const ASSISTANT_ACTION_TYPES = ASSISTANT_PROPOSAL_TYPES;

function shortText(value, max = MAX_SOURCE_TEXT) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim().slice(0, max);
}

function localized(value, localize) {
  if (typeof value === "string") return value;
  return shortText(localize?.(value) || value?.en || value?.es || "");
}

function termsFor(query) {
  return [...new Set(shortText(query, MAX_MESSAGE_CHARS).toLocaleLowerCase()
    .normalize("NFD").replace(/\p{M}/gu, "")
    .match(/[\p{L}\p{N}]{3,}/gu) || [])];
}

function sourceMatches(source, terms) {
  if (!terms.length) return false;
  const haystack = `${source.title} ${source.detail}`.toLocaleLowerCase()
    .normalize("NFD").replace(/\p{M}/gu, "");
  return terms.some((term) => haystack.includes(term) || haystack.split(/\s+/).some((word) => word.startsWith(term.slice(0, 4))));
}

function addSource(list, source) {
  if (!source?.id || list.some((entry) => entry.id === source.id)) return;
  list.push({
    id: shortText(source.id, 180),
    type: ["meal", "recipe", "grocery", "inventory", "available", "lunch", "preference", "history", "budget", "saved-list"].includes(source.type) ? source.type : "meal",
    title: shortText(source.title, 180),
    detail: shortText(source.detail),
    dateKey: /^\d{4}-\d{2}-\d{2}$/.test(source.dateKey) ? source.dateKey : "",
  });
}

function mealSummary(meal, recipes, localize) {
  const items = Array.isArray(meal?.items) ? meal.items : [];
  const names = items.map((item) => localized(recipes.find((recipe) => recipe.id === item.recipeId)?.name, localize) || item.recipeId).filter(Boolean);
  const notes = localized(meal?.notes, localize);
  return [names.join(", "), notes].filter(Boolean).join(" · ");
}

function localizedLines(value, language, localize) {
  if (Array.isArray(value)) return value.map((item) => localized(item, localize)).filter(Boolean);
  if (value && typeof value === "object") {
    const lines = (entry) => Array.isArray(entry) ? entry : typeof entry === "string" ? entry.split(/\r?\n/) : [];
    const preferred = lines(value[language]);
    const fallback = Object.values(value).flatMap(lines);
    return [...new Set((preferred.length ? preferred : fallback).map((item) => localized(item, localize)).filter(Boolean))];
  }
  return localized(value, localize) ? [localized(value, localize)] : [];
}

function ingredientSummary(recipe, language, localize) {
  return localizedLines(recipe?.ingredients || recipe?.ingredientsText, language, localize).slice(0, 25).join("; ");
}

function recipeSummary(recipe, language, localize) {
  return [
    ingredientSummary(recipe, language, localize),
    localizedLines(recipe?.steps || recipe?.stepsText, language, localize).slice(0, 8).join("; "),
    localized(recipe?.allergyWarning, localize),
    localized(recipe?.notes, localize),
    recipe?.servings ? `serves ${recipe.servings}` : "",
    recipe?.category,
  ].filter(Boolean).join(" · ");
}

function mealServingSummary(meal) {
  const plan = meal?.servingPlans?.dinner || meal?.servingPlan || {};
  const servings = Number(plan.adults || 0) + (Number(plan.kids || 0) * 0.5) + Number(plan.guests || 0);
  return servings > 0 ? `${servings} planned servings${Number(plan.extraServings || 0) ? ` + ${plan.extraServings} extra` : ""}` : "";
}

function lunchSummary(memberPlans, language) {
  return Object.entries(memberPlans || {}).map(([memberId, plan]) => {
    const foods = Object.values(plan?.components || {}).map((id) => lunchFoodById(id)?.name?.[language] || id).filter(Boolean);
    return [memberId, plan?.dayType, plan?.approved ? "approved" : "not approved", foods.join(", ")].filter(Boolean).join(" · ");
  }).filter(Boolean).join("; ");
}

function preferenceSummary(item, members) {
  const member = members.find((candidate) => candidate.id === item?.memberId);
  return [member?.name || item?.memberId, item?.kind, item?.value].filter(Boolean).join(" · ");
}

function rulesSummary(rules) {
  return [
    Number.isFinite(Number(rules?.repeatDays)) ? `repeat window ${rules.repeatDays} days` : "",
    Number.isFinite(Number(rules?.maxWeeknightMinutes)) ? `weeknight max ${rules.maxWeeknightMinutes} minutes` : "",
    Number.isFinite(Number(rules?.minKidSafeDinners)) ? `at least ${rules.minKidSafeDinners} kid-safe dinners` : "",
    Number.isFinite(Number(rules?.maxPastaDinners)) ? `at most ${rules.maxPastaDinners} pasta dinners` : "",
    rules?.preferLeftovers === true ? "prefer leftovers for lunch" : "",
  ].filter(Boolean).join(" · ");
}

function historySummary(item, recipes, localize) {
  const itemNames = (item?.items || []).map((entry) => localized(recipes.find((recipe) => recipe.id === entry.recipeId)?.name, localize) || entry.name || entry.recipeId).filter(Boolean);
  const leftovers = Object.values(item?.leftovers || {}).filter((amount) => Number(amount) > 0).length;
  return [item?.status, item?.outcome, itemNames.join(", "), leftovers ? `${leftovers} leftover record${leftovers === 1 ? "" : "s"}` : "", item?.note].filter(Boolean).join(" · ");
}

function dateKeysAround(now, displayedDateKeys = []) {
  const result = new Set(displayedDateKeys.filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key)));
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  for (let offset = -2; offset <= 8; offset += 1) {
    const date = new Date(cursor);
    date.setDate(date.getDate() + offset);
    const localKey = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
    result.add(localKey);
  }
  return [...result].sort().slice(0, 16);
}

function localDateKey(date = new Date()) {
  const value = new Date(date);
  return `${value.getFullYear()}-${`${value.getMonth() + 1}`.padStart(2, "0")}-${`${value.getDate()}`.padStart(2, "0")}`;
}

function grocerySummary(item, localize) {
  const uses = Array.isArray(item?.mealUses) ? item.mealUses : [];
  const linkedMeals = uses.slice(0, 4).map((use) => `${use.dateKey} ${use.mealSlot || ""} ${localized(use.recipeName, localize)}`).join(", ");
  return [localized(item?.text, localize), item?.checked ? "checked as bought" : "not checked as bought", linkedMeals].filter(Boolean).join(" · ");
}

/**
 * Creates a relevance-first, non-persistent context pack. Records are data,
 * not instructions; only plain bounded fields cross the model boundary.
 */
export function buildAssistantContext({
  question = "",
  retrievalText = "",
  priorSourceIds = [],
  language = "en",
  now = new Date(),
  displayedDateKeys = [],
  getMealForDate = () => ({}),
  recipes = [],
  groceries = [],
  inventory = [],
  availableFood = [],
  schoolLunches = {},
  preferences = [],
  familyMembers = [],
  rules = {},
  dinnerEvents = [],
  receipts = [],
  budget = {},
  savedLists = [],
  localize = (value) => value?.en || value?.es || "",
} = {}) {
  const sources = [];
  const dates = dateKeysAround(now, displayedDateKeys);
  const linkedRecipeIds = new Set();
  dates.forEach((dateKey) => {
    const meal = getMealForDate(dateKey) || {};
    const detail = [mealSummary(meal, recipes, localize), mealServingSummary(meal), meal?.dinnerPace, localized(meal?.notes, localize)].filter(Boolean).join(" · ");
    if (!detail) return;
    (meal.items || []).forEach((item) => linkedRecipeIds.add(item.recipeId));
    addSource(sources, { id: `meal:${dateKey}`, type: "meal", title: dateKey, detail, dateKey });
  });

  const recipeSources = recipes.map((recipe) => ({
    id: `recipe:${recipe.id}`,
    type: "recipe",
    title: localized(recipe.name, localize) || recipe.id,
    detail: recipeSummary(recipe, language, localize),
  }));
  recipeSources.filter((source) => linkedRecipeIds.has(source.id.slice(7))).forEach((source) => addSource(sources, source));

  const all = [
    ...recipeSources,
    ...groceries.map((item) => ({ id: `grocery:${item.id}`, type: "grocery", title: localized(item.text, localize) || item.ingredientKey, detail: grocerySummary(item, localize) })),
    ...inventory.map((item) => ({ id: `inventory:${item.id}`, type: "inventory", title: localized(item.text, localize), detail: [localized(item.quantity, localize) || (Number.isFinite(Number(item.amount)) ? `${item.amount} ${item.unit || ""}`.trim() : ""), item.unit, item.location, item.stockState, item.expiresOn].filter(Boolean).join(" · ") })),
    ...availableFood.map((item) => ({ id: `available:${item.id}`, type: "available", title: localized(item.label, localize), detail: [item.type, item.freshness, item.useFor].filter(Boolean).join(" · ") })),
    ...Object.entries(schoolLunches?.plans || {}).slice(0, 20).map(([dateKey, plans]) => ({ id: `lunch:${dateKey}`, type: "lunch", title: dateKey, detail: shortText(lunchSummary(plans, language), 700), dateKey })),
    ...preferences.slice(0, 30).map((item, index) => ({ id: `preference:${item.id || index}`, type: "preference", title: shortText(familyMembers.find((member) => member.id === item.memberId)?.name || "Family preference"), detail: shortText(preferenceSummary(item, familyMembers), 700) })),
    ...(Object.keys(rules || {}).length ? [{ id: "preference:rules", type: "preference", title: "Household rules", detail: shortText(rulesSummary(rules), 700) }] : []),
    ...dinnerEvents.slice(0, 25).map((item) => ({ id: `history:${item.id}`, type: "history", title: item.dateKey || item.updatedAt || "Dinner history", detail: shortText(historySummary(item, recipes, localize), 700), dateKey: item.dateKey })),
    ...(receipts.length || budget?.monthlyTarget ? (() => { const summary = budgetForMonth(receipts, now, budget); return [{ id: "budget:summary", type: "budget", title: "Budget and receipts", detail: `Complete ${summary.monthKey} ledger: ${summary.receipts.length} receipts · spent ${summary.spent} · target ${summary.target || "not set"}` }]; })() : []),
    ...savedLists.slice(0, 12).map((item) => ({ id: `saved-list:${item.id}`, type: "saved-list", title: shortText(item.name || "Saved shopping list"), detail: `${Array.isArray(item.items) ? item.items.length : 0} items` })),
  ];
  const terms = termsFor(`${retrievalText} ${question}`);
  const priorSources = all.filter((source) => priorSourceIds.includes(source.id));
  const selected = [];
  const hardRestrictions = all.filter((source) => source.type === "preference" && /\brestriction\b/i.test(source.detail));
  const queryMatches = [...sources, ...all].filter((source) => sourceMatches(source, terms));
  // Restrictions are always supplied for recommendation safety. Then query
  // matches win over generic linked recipes, followed by the displayed plan.
  [...hardRestrictions, ...priorSources, ...queryMatches, ...sources,
    ...all.filter((source) => source.type === "grocery" || source.type === "inventory"), ...all]
    .forEach((source) => addSource(selected, source));
  return {
    dates,
    scope: {
      today: localDateKey(now),
      viewedDateKeys: displayedDateKeys.filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key)).slice(0, 7),
      resolvedDateKeys: dates,
      coverage: "Loaded household records only; missing source cards are not evidence of absence.",
    },
    sources: selected.slice(0, MAX_SOURCES),
  };
}

export function boundedConversationHistory(messages = []) {
  return messages.slice(-MAX_HISTORY).map((message) => ({
    role: message?.role === "assistant" ? "assistant" : "user",
    text: shortText(message?.text, MAX_MESSAGE_CHARS),
  })).filter((message) => message.text);
}

export function normalizeAssistantReply(value, context = { sources: [] }) {
  if (!value || typeof value !== "object") return null;
  const sourceIds = new Set((context.sources || []).map((source) => source.id));
  const sources = [...new Set((Array.isArray(value.sources) ? value.sources : [])
    .map((id) => shortText(id, 180)).filter((id) => sourceIds.has(id)))].slice(0, 6);
  const action = normalizeAssistantProposal(value.action, {
    sourceIds,
    sourceTypes: new Map((context.sources || []).map((source) => [source.id, source.type])),
    dateKeys: new Set(context?.dates || context?.scope?.resolvedDateKeys || []),
  });
  const answer = shortText(value.answer, 1200);
  return answer ? { answer, sources, action } : null;
}
