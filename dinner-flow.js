import {
  boundedCount,
  boundedServings,
  cleanRecipeId,
  countFieldIsIncomplete,
  countFieldNormalizedValue,
  normalizeMealPlan,
  normalizeServingPlan,
  parseCountableInput,
  rewriteCountFieldDisplay,
} from "./schedule-utils.js";

export {
  boundedCount,
  boundedServings,
  cleanRecipeId,
  countFieldIsIncomplete,
  countFieldNormalizedValue,
  parseCountableInput,
  rewriteCountFieldDisplay,
};

export function exactRecipeById(recipes, recipeId) {
  const id = cleanRecipeId(String(recipeId ?? ""));
  if (!id) return null;
  return (recipes || []).find((recipe) => recipe && cleanRecipeId(String(recipe.id)) === id) || null;
}

export function selectedDinnerRecipeId(recipes, recipeId) {
  return exactRecipeById(recipes, recipeId)?.id || "";
}

export function resolveDinnerSuggestionId(recipes, suggestedRecipeId) {
  return selectedDinnerRecipeId(recipes, suggestedRecipeId);
}

export function initialDinnerPickerSelection({
  recipes = [],
  suggestedRecipeId = "",
  existingRecipeId = "",
  choose = false,
} = {}) {
  const suggestionId = resolveDinnerSuggestionId(recipes, suggestedRecipeId);
  if (choose) return { suggestionId, selectedId: suggestionId };
  return {
    suggestionId,
    selectedId: suggestionId || selectedDinnerRecipeId(recipes, existingRecipeId),
  };
}

export function writtenDinnerRecipeId(meal, role = "main") {
  return role === "side"
    ? dinnerSideItem(meal)?.recipeId || ""
    : dinnerMainItem(meal)?.recipeId || "";
}

export function dinnerReviewIsReady(meal, recipes, selectedId, role = "main") {
  const writtenId = writtenDinnerRecipeId(meal, role);
  const recipe = exactRecipeById(recipes, writtenId);
  return Boolean(recipe && writtenId && cleanRecipeId(writtenId) === cleanRecipeId(selectedId));
}

export function advanceDinnerSelection(meal, recipes, selectedId, role = "main") {
  const recipeId = selectedDinnerRecipeId(recipes, selectedId);
  if (!recipeId) return { ok: false, meal: normalizeMealPlan(meal), selectedId: "" };
  const next = assignDinnerRecipe(meal, recipeId, role);
  const writtenId = writtenDinnerRecipeId(next, role);
  if (!writtenId || cleanRecipeId(writtenId) !== cleanRecipeId(recipeId)) {
    return { ok: false, meal: normalizeMealPlan(meal), selectedId: "" };
  }
  return { ok: true, meal: next, selectedId: writtenId };
}

export function confirmSelectedDinnerRecipe(meal, recipes, selectedId, role = "main") {
  const result = advanceDinnerSelection(meal, recipes, selectedId, role);
  return result.ok ? result.meal : normalizeMealPlan(meal);
}

export function dinnerItems(meal) {
  return (normalizeMealPlan(meal).items || []).filter((item) => item.period === "dinner");
}

export function dinnerMainItem(meal) {
  const items = dinnerItems(meal);
  return items.find((item) => item.role === "main") || items[0] || null;
}

export function dinnerSideItem(meal) {
  return dinnerItems(meal).find((item) => item.role === "side") || null;
}

export function dinnerIsOpen(meal) {
  return !dinnerMainItem(meal);
}

export function sampleDinnerRecipes(recipes = [], {
  favorites = [],
  limit = 2,
  hasPhoto = () => false,
  categoryFor = (recipe) => recipe?.category || "main",
} = {}) {
  const favoriteIds = new Set(favorites);
  return [...recipes]
    .filter((recipe) => recipe && hasPhoto(recipe))
    .sort((left, right) => {
      const leftFavorite = favoriteIds.has(left.id) ? 0 : 1;
      const rightFavorite = favoriteIds.has(right.id) ? 0 : 1;
      if (leftFavorite !== rightFavorite) return leftFavorite - rightFavorite;
      const leftMain = categoryFor(left) === "main" ? 0 : 1;
      const rightMain = categoryFor(right) === "main" ? 0 : 1;
      return leftMain - rightMain;
    })
    .slice(0, Math.max(0, limit));
}

export function filterDinnerRecipes(recipes = [], {
  query = "",
  filter = "all",
  favorites = [],
  lang = "en",
  categoryFor = (recipe) => recipe?.category || "main",
  textValues = (value) => [typeof value === "string" ? value : ""],
} = {}) {
  const normalizedQuery = `${query || ""}`.trim().toLocaleLowerCase(lang === "es" ? "es" : "en");
  const favoriteIds = new Set(favorites);
  return recipes.filter((recipe) => {
    if (!recipe) return false;
    const category = categoryFor(recipe);
    if (filter === "favorites" && !favoriteIds.has(recipe.id)) return false;
    if (filter === "sides" && category !== "side") return false;
    if (!normalizedQuery) return true;
    const haystack = [
      ...[recipe.name, recipe.meta, recipe.short, recipe.tags].flatMap(textValues),
      category,
    ].join(" ").toLocaleLowerCase(lang === "es" ? "es" : "en");
    return haystack.includes(normalizedQuery);
  });
}

function nextMealItemId(existingId = "") {
  if (typeof existingId === "string" && /^[a-z0-9-]{1,160}$/i.test(existingId)) return existingId;
  return `meal-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function assignDinnerRecipe(meal, recipeId, role = "main") {
  const nextRecipeId = cleanRecipeId(recipeId);
  const next = normalizeMealPlan(meal);
  if (!nextRecipeId) {
    if (role === "side") {
      next.items = next.items.filter((item) => !(item.period === "dinner" && item.role === "side"));
      return normalizeMealPlan(next);
    }
    return next;
  }
  if (role === "side") {
    const existingSide = dinnerSideItem(next);
    next.items = next.items.filter((item) => item.id !== existingSide?.id);
    next.items.push({
      id: nextMealItemId(existingSide?.id),
      period: "dinner",
      role: "side",
      sourceType: "recipe",
      recipeId: nextRecipeId,
    });
    return normalizeMealPlan(next);
  }
  const existingMain = dinnerMainItem(next);
  next.items = next.items.filter((item) => item.id !== existingMain?.id);
  next.items.push({
    id: nextMealItemId(existingMain?.id),
    period: "dinner",
    role: role === "main" ? "main" : role,
    sourceType: "recipe",
    recipeId: nextRecipeId,
  });
  return normalizeMealPlan(next);
}

export function applyDinnerServingField(meal, field, value) {
  const next = normalizeMealPlan(meal);
  const current = next.servingPlans?.dinner || next.servingPlan;
  const dinnerPlan = normalizeServingPlan({
    ...current,
    [field]: countFieldNormalizedValue(value, field),
  });
  next.servingPlans = { ...next.servingPlans, dinner: dinnerPlan };
  next.servingPlan = { ...next.servingPlan, ...dinnerPlan };
  return normalizeMealPlan(next);
}

export function applyDinnerItemRole(meal, itemId, role) {
  const next = normalizeMealPlan(meal);
  next.items = next.items.map((item) => item.id === itemId ? { ...item, role } : item);
  return normalizeMealPlan(next);
}

export function stepCountValue(value, field, step) {
  const current = countFieldNormalizedValue(value, field);
  const increment = Number(step);
  if (!Number.isFinite(increment) || increment === 0) return current;
  return countFieldNormalizedValue(current + increment, field);
}
