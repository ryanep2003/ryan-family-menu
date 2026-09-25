import { localizedTextExact } from "./localized-data.js";
import { recommendationForRecipe, normalizeFamilyMembers, normalizeFamilyPreferences, normalizeFamilyRules } from "./memory-logic.js";
import { planFromWhatWeHave } from "./plan-from-what-we-have.js";
import { categoryFor } from "./recipe-utils.js";
import { activeWeekDateKeys, normalizeCalendar, normalizeMealPlan, normalizeSchedule, normalizeServingPlan } from "./schedule-utils.js";

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(value.slice(0, 4))
    && date.getMonth() + 1 === Number(value.slice(5, 7)) && date.getDate() === Number(value.slice(8, 10));
}

function boundedCount(value, fallback) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.min(7, Math.round(count))) : fallback;
}

function prepMinutes(recipe) {
  const values = [recipe?.meta, recipe?.short].flatMap((value) => (
    typeof value === "string" ? [value] : [localizedTextExact(value, "en"), localizedTextExact(value, "es")]
  ));
  const matches = values.map((value) => `${value || ""}`.match(/\b(\d{1,3})\s*(?:min(?:ute)?s?|minutos?)\b/i)).filter(Boolean);
  return matches.length ? Number(matches[0][1]) : null;
}

function mainRecipeId(meal) {
  return meal.items.find((item) => item.period === "dinner" && item.role === "main")?.recipeId || "";
}

function hasVerifiedIngredients(recipe) {
  return [recipe?.ingredients?.en, recipe?.ingredients?.es].some((items) =>
    Array.isArray(items) && items.some((item) => typeof item === "string" && item.trim()
      && !/^(?:add ingredients after review|agrega los ingredientes)/i.test(item.trim())));
}

function sortedCandidates({ recipes, dateKey, maxMinutes, usedIds, excludedIds, favorites, inventory, events, members, preferences, rules }) {
  const homeMatches = new Map(planFromWhatWeHave({ recipes, inventory, preferences: [], leftovers: [] })
    .map((option) => [option.recipeId, option]));
  return recipes.filter((recipe) => recipe?.id && categoryFor(recipe) === "main"
      && !usedIds.has(recipe.id) && !excludedIds.has(recipe.id))
    .map((recipe) => {
      const minutes = prepMinutes(recipe);
      if (maxMinutes !== null && (minutes === null || minutes > maxMinutes)) return null;
      const recommendation = recommendationForRecipe(recipe, {
        events, members, preferences, rules, dateKey, recipeFeedback: {},
      });
      if (recommendation.blocked) return null;
      const home = homeMatches.get(recipe.id);
      const reasons = [...recommendation.reasons];
      if (favorites.has(recipe.id)) reasons.push("favorite");
      if (home?.uses?.length) reasons.push("uses-home-food");
      if (minutes !== null) reasons.push("known-time");
      return {
        recipe,
        score: recommendation.score + (favorites.has(recipe.id) ? 3 : 0) + Math.min(home?.uses?.length || 0, 3),
        reasonCodes: [...new Set(reasons)],
        needsRestrictionReview: preferences.some((item) => item.kind === "restriction"),
        hasVerifiedIngredients: hasVerifiedIngredients(recipe),
      };
    }).filter(Boolean)
    .sort((left, right) => right.score - left.score || left.recipe.id.localeCompare(right.recipe.id));
}

/** A read-only seven-date dinner proposal. Approval is a separate, conflict-aware workflow. */
export function createWeekDraft({
  weekStartKey, schedule = {}, calendarMeals = {}, recipes = [], members = [], preferences = [],
  rules = {}, events = [], favorites = [], inventory = [], targetDinnerCount = 5, scheduleVersion = 0,
  maxMinutesByDate = {}, excludedRecipeIds = [], previousDraft = null,
} = {}) {
  if (!validDateKey(weekStartKey) || new Date(`${weekStartKey}T12:00:00`).getDay() !== 1) {
    throw new TypeError("A valid Monday week start date is required.");
  }
  const weekDates = activeWeekDateKeys(weekStartKey);
  const weekSchedule = normalizeSchedule(schedule);
  const overrides = normalizeCalendar(calendarMeals);
  const familyMembers = normalizeFamilyMembers(members);
  const familyPreferences = normalizeFamilyPreferences(preferences, familyMembers);
  const familyRules = normalizeFamilyRules(rules);
  const excludedIds = new Set(excludedRecipeIds.filter((id) => typeof id === "string" && id).slice(0, 100));
  const favoriteIds = new Set(favorites.filter((id) => typeof id === "string" && id).slice(0, 100));
  const visibleRecipes = recipes.filter((recipe) => recipe?.id && categoryFor(recipe) === "main");
  const visibleIds = new Set(visibleRecipes.map((recipe) => recipe.id));
  const priorDays = new Map((Array.isArray(previousDraft?.days) ? previousDraft.days : []).map((day) => [day.dateKey, day]));
  const effectiveMealsByDate = Object.fromEntries(weekDates.map(({ key, dateKey }) => [
    dateKey, normalizeMealPlan(Object.hasOwn(overrides, dateKey) ? overrides[dateKey] : weekSchedule[key]),
  ]));
  const usedIds = new Set(Object.values(effectiveMealsByDate).map(mainRecipeId).filter(Boolean));
  const lockedCarryByDate = new Map(weekDates.map(({ dateKey }) => [dateKey, priorDays.get(dateKey)])
    .filter(([dateKey, prior]) => !mainRecipeId(effectiveMealsByDate[dateKey]) && prior?.locked
      && prior.recipeId && visibleIds.has(prior.recipeId)
      && !familyPreferences.some((item) => item.kind === "restriction")));
  lockedCarryByDate.forEach((prior) => usedIds.add(prior.recipeId));
  const target = boundedCount(targetDinnerCount, 5);
  let filled = Object.values(effectiveMealsByDate).filter((meal) => mainRecipeId(meal)).length + lockedCarryByDate.size;

  const days = weekDates.map(({ dateKey, key }) => {
    const meal = effectiveMealsByDate[dateKey];
    const existingId = mainRecipeId(meal);
    const servingPlan = normalizeServingPlan(meal.servingPlans?.dinner || meal.servingPlan);
    if (existingId) return { dateKey, status: "kept", recipeId: existingId, servingPlan, reasonCodes: ["already-planned"], locked: true, needsRestrictionReview: false };
    const prior = priorDays.get(dateKey);
    if (prior?.locked) {
      if (lockedCarryByDate.has(dateKey)) {
        return { dateKey, status: "kept", recipeId: prior.recipeId, servingPlan: normalizeServingPlan(prior.servingPlan), reasonCodes: ["kept-by-family"], locked: true, needsRestrictionReview: false };
      }
      return { dateKey, status: "unresolved", recipeId: "", servingPlan, reasonCodes: ["locked-choice-needs-review"], locked: true, needsRestrictionReview: Boolean(prior.recipeId) };
    }
    if (filled >= target) return { dateKey, status: "unresolved", recipeId: "", servingPlan, reasonCodes: ["outside-dinner-target"], locked: false, needsRestrictionReview: false };
    const configuredMinutes = Number(maxMinutesByDate?.[dateKey]);
    const maxMinutes = Number.isFinite(configuredMinutes) && configuredMinutes > 0
      ? Math.max(1, Math.min(240, Math.round(configuredMinutes)))
      : ["mon", "tue", "wed", "thu", "fri"].includes(key) && familyRules.maxWeeknightMinutes > 0
        ? familyRules.maxWeeknightMinutes : null;
    const candidates = sortedCandidates({
      recipes: visibleRecipes, dateKey, maxMinutes, usedIds, excludedIds,
      favorites: favoriteIds, inventory, events, members: familyMembers,
      preferences: familyPreferences, rules: familyRules,
    });
    const candidate = candidates.find((item) => item.hasVerifiedIngredients && !item.needsRestrictionReview) || candidates[0];
    if (!candidate || candidate.needsRestrictionReview || !candidate.hasVerifiedIngredients) {
      return {
        dateKey, status: "unresolved", recipeId: "", servingPlan,
        reasonCodes: [candidate?.needsRestrictionReview ? "restriction-needs-review" : candidate && !candidate.hasVerifiedIngredients ? "ingredients-unknown" : "no-verified-match"],
        locked: false, needsRestrictionReview: Boolean(candidate?.needsRestrictionReview),
      };
    }
    usedIds.add(candidate.recipe.id);
    filled += 1;
    return { dateKey, status: "suggested", recipeId: candidate.recipe.id, servingPlan, reasonCodes: candidate.reasonCodes, locked: false, needsRestrictionReview: false };
  });

  return {
    schemaVersion: 1, weekStartKey,
    base: { scheduleVersion: previousDraft?.base?.scheduleVersion ?? scheduleVersion, effectiveMealsByDate: previousDraft?.base?.effectiveMealsByDate || effectiveMealsByDate },
    constraints: { targetDinnerCount: target, maxMinutesByDate: Object.fromEntries(weekDates
      .filter(({ dateKey }) => Number.isFinite(Number(maxMinutesByDate?.[dateKey])) && Number(maxMinutesByDate[dateKey]) > 0)
      .map(({ dateKey }) => [dateKey, Math.max(1, Math.min(240, Math.round(Number(maxMinutesByDate[dateKey]))))])), excludedRecipeIds: [...excludedIds] },
    days,
  };
}
