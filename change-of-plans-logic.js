import { categoryFor, servingsForRecipe } from "./recipe-utils.js";
import { localizedTextExact } from "./localized-data.js";
import { normalizeFamilyMembers, normalizeFamilyPreferences, normalizeFamilyRules, recommendationForRecipe } from "./memory-logic.js";
import { cookingServings, normalizeMealPlan, normalizeServingPlan, plannedServings, recipeBatchPlan } from "./schedule-utils.js";
import { cleanIngredientForGrocery, parseIngredientAmount, scaleIngredientText } from "./grocery-logic.js";

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(value.slice(0, 4))
    && date.getMonth() + 1 === Number(value.slice(5, 7)) && date.getDate() === Number(value.slice(8, 10));
}

function validAttendance(value) {
  return value && ["adults", "kids", "guests"].every((key) =>
    Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= 20);
}

/** Read-only dinner-attendance preview; no schedule or grocery record is written. */
export function previewDinnerAttendanceChange({ dateKey, meal, attendance, recipes = [] } = {}) {
  if (!validDateKey(dateKey)) throw new TypeError("A valid dinner date is required.");
  if (!validAttendance(attendance)) throw new TypeError("Attendance must contain bounded adult, child, and guest counts.");
  const before = normalizeMealPlan(meal);
  const previousPlan = normalizeServingPlan(before.servingPlans.dinner);
  const nextPlan = normalizeServingPlan({ ...previousPlan, ...attendance });
  const after = normalizeMealPlan({
    ...before,
    servingPlan: nextPlan,
    servingPlans: { ...before.servingPlans, dinner: nextPlan },
  });
  const byId = new Map(recipes.filter((recipe) => recipe?.id).map((recipe) => [recipe.id, recipe]));
  const groceryContributions = before.items.filter((item) => item.period === "dinner" && item.sourceType !== "leftover")
    .map((item) => {
      const recipe = byId.get(item.recipeId);
      const recipeYield = recipe ? servingsForRecipe(recipe) : 0;
      const prior = recipeBatchPlan(recipeYield, cookingServings(previousPlan), plannedServings(previousPlan));
      const next = recipeBatchPlan(recipeYield, cookingServings(nextPlan), plannedServings(nextPlan));
      const count = Math.max(recipe?.ingredients?.en?.length || 0, recipe?.ingredients?.es?.length || 0);
      const ingredients = Array.from({ length: count }, (_, index) => {
        const source = Object.fromEntries(["en", "es"].map((lang) =>
          [lang, cleanIngredientForGrocery(recipe.ingredients?.[lang]?.[index])]).filter(([, value]) => value));
        const scaled = (batch) => Object.fromEntries(Object.entries(source)
          .map(([lang, value]) => [lang, batch ? scaleIngredientText(value, batch) : ""]));
        return {
          index,
          before: scaled(prior?.batches),
          after: scaled(next?.batches),
          quantityKnown: Object.values(source).some((value) => parseIngredientAmount(value).quantity > 0),
        };
      }).filter((entry) => Object.values(entry.before).some(Boolean) || Object.values(entry.after).some(Boolean));
      return {
        itemId: item.id,
        recipeId: item.recipeId,
        knownRecipe: Boolean(recipe),
        ingredientsKnown: hasVerifiedIngredients(recipe),
        ingredients,
        beforeBatches: prior?.batches ?? null,
        afterBatches: next?.batches ?? null,
        assumedYield: Boolean(prior?.assumedYield || next?.assumedYield),
      };
    });
  return {
    dateKey,
    before,
    after,
    beforeServings: plannedServings(previousPlan),
    afterServings: plannedServings(nextPlan),
    groceryContributions,
    needsShoppingReview: groceryContributions.some((item) => item.beforeBatches !== item.afterBatches),
  };
}

function verifiedMinutes(recipe) {
  const fields = [recipe?.meta, recipe?.short].flatMap((value) =>
    typeof value === "string" ? [value] : [localizedTextExact(value, "en"), localizedTextExact(value, "es")]);
  const match = fields.map((value) => `${value || ""}`.match(/\b(\d{1,3})\s*(?:min(?:ute)?s?|minutos?)\b/i)).find(Boolean);
  return match ? Number(match[1]) : null;
}

function hasVerifiedIngredients(recipe) {
  return [recipe?.ingredients?.en, recipe?.ingredients?.es].some((items) =>
    Array.isArray(items) && items.some((item) => typeof item === "string" && item.trim()
      && !/^(?:add ingredients after review|agrega los ingredientes)/i.test(item.trim())));
}

/** Known quick dinner alternatives. Manual no-cooking remains a choice, never an inferred recipe. */
export function quickDinnerAlternatives({ dateKey, meal, recipes = [], maxMinutes, members = [], preferences = [], rules = {}, events = [] } = {}) {
  if (!validDateKey(dateKey)) throw new TypeError("A valid dinner date is required.");
  if (!Number.isInteger(maxMinutes) || maxMinutes < 1 || maxMinutes > 240) {
    throw new TypeError("Time must be between 1 and 240 minutes.");
  }
  const current = normalizeMealPlan(meal).items.find((item) => item.period === "dinner" && item.role === "main")?.recipeId;
  if (!current) return { dateKey, currentRecipeId: "", options: [], manualNoCooking: true };
  const familyMembers = normalizeFamilyMembers(members);
  const familyPreferences = normalizeFamilyPreferences(preferences, familyMembers);
  const familyRules = normalizeFamilyRules(rules);
  const options = recipes.filter((recipe) => recipe?.id && recipe.id !== current && categoryFor(recipe) === "main")
    .map((recipe) => {
      const minutes = verifiedMinutes(recipe);
      if (minutes === null || minutes > maxMinutes || minutes < 1) return null;
      if (!hasVerifiedIngredients(recipe)) return null;
      const recommendation = recommendationForRecipe(recipe, {
        dateKey, events, members: familyMembers, preferences: familyPreferences, rules: familyRules, recipeFeedback: {},
      });
      if (recommendation.blocked) return null;
      return {
        recipeId: recipe.id,
        minutes,
        needsRestrictionReview: familyPreferences.some((item) => item.kind === "restriction"),
        score: recommendation.score,
      };
    }).filter(Boolean)
    .sort((left, right) => left.minutes - right.minutes || right.score - left.score || left.recipeId.localeCompare(right.recipeId));
  return { dateKey, currentRecipeId: current || "", options, manualNoCooking: true };
}

/** Preview a replacement of today's recipe main, keeping the meal item ID and every other item. */
export function previewQuickDinnerReplacement({ dateKey, meal, recipeId, recipes = [] } = {}) {
  if (!validDateKey(dateKey)) throw new TypeError("A valid dinner date is required.");
  const before = normalizeMealPlan(meal);
  const main = before.items.find((item) => item.period === "dinner" && item.role === "main" && item.sourceType === "recipe");
  const replacement = recipes.find((recipe) => recipe?.id === recipeId);
  if (!main || !replacement || main.recipeId === recipeId || !hasVerifiedIngredients(replacement)) {
    throw new TypeError("A different known dinner recipe is required.");
  }
  const after = normalizeMealPlan({
    ...before,
    mealItemsVersion: 1,
    items: before.items.map((item) => item.id === main.id && item.period === "dinner" && item.role === "main"
      ? { ...item, sourceType: "recipe", recipeId, leftoverSourceDate: "", leftoverSourceItemId: "" }
      : item),
  });
  const attendance = Object.fromEntries(["adults", "kids", "guests"].map((key) => [key, before.servingPlans.dinner[key]]));
  const contributions = (candidate) => previewDinnerAttendanceChange({ dateKey, meal: candidate, attendance, recipes })
    .groceryContributions.find((item) => item.itemId === main.id);
  return { dateKey, before, after, oldRecipeId: main.recipeId, recipeId,
    beforeContribution: contributions(before), afterContribution: contributions(after), needsShoppingReview: true };
}
