import { allLocalizedText } from "./localized-data.js";
import { recommendationForRecipe } from "./memory-logic.js";

function textParts(value) {
  if (Array.isArray(value)) return value.flatMap(textParts);
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  if (typeof value.text === "string") return [value.text];
  if (typeof value.name === "string") return [value.name];
  if (typeof value.label === "string") return [value.label];
  for (const key of ["text", "name", "label", "value"]) {
    if (key in value) return textParts(value[key]);
  }
  return allLocalizedText(value);
}

function normalizedWords(value) {
  return textParts(value).join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function foodMatches(ingredient, availableFoods) {
  const ingredientWords = normalizedWords(ingredient);
  if (!ingredientWords.length) return false;
  return availableFoods.some((food) => {
    const foodWords = normalizedWords(food);
    return foodWords.length && foodWords.every((word) => ingredientWords.some((entry) => entry === word || entry.includes(word) || word.includes(entry)));
  });
}

function recipeIngredients(recipe) {
  const values = recipe?.ingredients;
  if (Array.isArray(values)) return [...new Set(values.filter((value) => textParts(value).length))];
  if (values && typeof values === "object") {
    const preferred = Array.isArray(values.en) && values.en.length ? values.en : values.es;
    const localized = [...new Set(Array.isArray(preferred) ? preferred.filter((value) => textParts(value).length) : [])];
    if (localized.length) return localized;
  }
  return [...new Set(textParts(recipe?.ingredientsText).flatMap((value) => value.split(/\n|;/).map((line) => line.trim()).filter(Boolean)))];
}

function recipeText(recipe) {
  return [recipe?.name, recipe?.ingredients, recipe?.ingredientsText, recipe?.tags, recipe?.meta, recipe?.short, recipe?.description]
    .flatMap(textParts).join(" ");
}

function prepMinutes(recipe) {
  const source = [recipe?.totalTime, recipe?.prepTime, recipe?.meta, recipe?.short].flatMap(textParts).join(" ");
  const iso = source.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (iso) return (Number(iso[1]) || 0) * 60 + (Number(iso[2]) || 0);
  const hours = Number(source.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i)?.[1] || 0);
  const minutes = Number(source.match(/(\d+)\s*(?:minutes?|mins?)/i)?.[1] || 0);
  return hours * 60 + minutes;
}

function preferenceWords(preferences) {
  return preferences
    .filter((item) => ["restriction", "dislike"].includes(item?.kind))
    .flatMap((item) => normalizedWords(item.value));
}

/**
 * Return up to three complete, advisory dinner candidates without changing the plan.
 * Matching is intentionally conservative: a candidate must use something already at home.
 */
export function planFromWhatWeHave({
  inventory = [],
  recipes = [],
  preferences = [],
  members = [],
  rules = {},
  recipeFeedback = {},
  events = [],
  leftovers = [],
  budget = {},
  servings = 4,
  maxPrepMinutes = 90,
} = {}) {
  const inventoryFoods = inventory.filter((item) => item && item.stockState !== "out").flatMap(textParts);
  const leftoverFoods = leftovers.filter(Boolean).flatMap(textParts);
  const availableFoods = [...inventoryFoods, ...leftoverFoods];
  const restricted = preferenceWords(preferences);
  const monthlyTarget = Number(budget?.monthlyTarget || budget?.target) || 0;

  return recipes
    .filter((recipe) => recipe?.category === "main" || recipe?.role === "main")
    .map((recipe) => {
      const words = normalizedWords(recipeText(recipe));
      if (restricted.some((restriction) => words.includes(restriction))) return null;
      const recommendation = recommendationForRecipe(recipe, {
        members,
        preferences,
        rules,
        recipeFeedback,
        events,
      });
      if (recommendation.blocked) return null;
      const minutes = prepMinutes(recipe);
      if (minutes > maxPrepMinutes) return null;
      const ingredients = recipeIngredients(recipe);
      if (!ingredients.length) return null;
      const uses = ingredients.filter((ingredient) => foodMatches(ingredient, availableFoods));
      if (!uses.length) return null;
      const remaining = ingredients.filter((ingredient) => !uses.includes(ingredient));
      const usesLeftover = uses.some((ingredient) => foodMatches(ingredient, leftoverFoods));
      const estimatedCost = Number(recipe.estimatedCost || recipe.cost) || 0;
      const score = uses.length * 4 - remaining.length + (usesLeftover ? 3 : 0)
        + (estimatedCost && monthlyTarget > 0 && estimatedCost <= monthlyTarget / 10 ? 1 : 0);
      return {
        recipeId: recipe.id,
        recipe,
        servings,
        uses,
        remaining,
        prepMinutes: minutes,
        estimatedCost,
        score,
        reason: remaining.length ? "usesMostOfWhatWeHave" : "usesWhatWeHave",
        groceryImpact: remaining.length ? "needsGroceries" : "coveredAtHome",
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || String(left.recipeId).localeCompare(String(right.recipeId)))
    .slice(0, 3);
}
