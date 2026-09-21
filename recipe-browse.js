import { cardPhotoFor, cardPhotoIsGenerated, recipeTileTone } from "./recipe-utils.js";

export const LIBRARY_STRIP_LIMIT = 5;

export function libraryStripRecipes({
  recipes = [],
  favoriteIds = [],
  getRecipeMemory = () => ({}),
  limit = LIBRARY_STRIP_LIMIT,
} = {}) {
  const byId = new Map((Array.isArray(recipes) ? recipes : [])
    .filter((recipe) => recipe?.id)
    .map((recipe) => [recipe.id, recipe]));
  const seen = new Set();
  const picks = [];

  function push(id, reason) {
    if (picks.length >= limit) return;
    const recipe = byId.get(id);
    if (!recipe || seen.has(recipe.id)) return;
    seen.add(recipe.id);
    picks.push({ recipe, reason });
  }

  for (const id of Array.isArray(favoriteIds) ? favoriteIds : []) push(id, "favorite");

  const recent = (Array.isArray(recipes) ? recipes : [])
    .map((recipe) => ({
      id: recipe?.id,
      lastMade: getRecipeMemory(recipe?.id)?.lastMade || "",
    }))
    .filter((entry) => entry.id && /^\d{4}-\d{2}-\d{2}$/.test(entry.lastMade))
    .sort((left, right) => `${right.lastMade}`.localeCompare(`${left.lastMade}`)
      || `${left.id}`.localeCompare(`${right.id}`));

  for (const entry of recent) push(entry.id, "recent");
  return picks;
}

export function recipeBrowsePhotoMarkup(recipe, name, escapeHtml) {
  const cardPhoto = cardPhotoFor(recipe);
  const hasPhoto = !cardPhotoIsGenerated(recipe) && Boolean(cardPhoto);
  const canHydratePhoto = !hasPhoto && recipe?.hasSourcePhotos;
  const safeName = escapeHtml(name || "");
  if (hasPhoto) {
    return {
      markup: `<span class="recipe-photo-shell is-loaded"><img src="${escapeHtml(cardPhoto)}" alt="${safeName}" loading="lazy" decoding="async" /></span>`,
      mediaClass: "has-media",
    };
  }
  if (canHydratePhoto) {
    return {
      markup: `<span class="recipe-photo-shell" data-recipe-photo-id="${escapeHtml(recipe.id)}" data-recipe-photo-alt="${safeName}" aria-hidden="true"></span>`,
      mediaClass: "has-media",
    };
  }
  return {
    markup: `<span class="recipe-photo-tile" data-tone="${recipeTileTone(recipe)}" aria-hidden="true"></span>`,
    mediaClass: "has-tile",
  };
}
