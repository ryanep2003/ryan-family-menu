import { getStore } from "@netlify/blobs";
import { householdDataKey, requireHouseholdAccess } from "./_household.js";
import { jsonResponse, readJsonRequest } from "./_http.js";
import { cleanLocalizedText, hasLocalizedContent, localizedText } from "../../localized-data.js";
import { compactRecipeForCatalog } from "../../recipe-catalog-utils.js";

const STORE_NAME = "family-menu-recipes";
const RECIPES_KEY = "recipes";
const INDEX_KEY = "recipe-index";
const RECIPE_PREFIX = "recipe:";
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 500000;
const MAX_REQUEST_BYTES = 2000000;
const MAX_TEXT_LENGTH = 12000;
const MAX_RECIPES = 200;

function cleanPhotos(photos) {
  if (!Array.isArray(photos)) return [];
  return photos
    .filter((photo) => typeof photo === "string"
      && photo.startsWith("data:image/")
      && photo.length * 0.75 <= MAX_PHOTO_BYTES)
    .slice(0, MAX_PHOTOS);
}

function cleanPhoto(value) {
  if (typeof value !== "string") return "";
  const photo = value.trim();
  if (photo.startsWith("data:image/") && photo.length * 0.75 <= MAX_PHOTO_BYTES) return photo;
  if (/^assets\/[a-z0-9-]+\.(?:jpe?g|webp)$/i.test(photo)) return photo;
  return "";
}

export function cleanRecipe(input) {
  const name = cleanLocalizedText(input.name, 120);
  const ingredientsText = cleanLocalizedText(input.ingredientsText, MAX_TEXT_LENGTH);
  const stepsText = cleanLocalizedText(input.stepsText, MAX_TEXT_LENGTH);
  if (!hasLocalizedContent(name) || !hasLocalizedContent(ingredientsText) || !hasLocalizedContent(stepsText)) return null;

  const id = typeof input.id === "string" && input.id.startsWith("shared-")
    ? input.id
    : `shared-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const category = ["main", "side", "salad", "sauce", "dessert"].includes(input.category)
    ? input.category
    : "main";

  return {
    id,
    name,
    category,
    servings: Number.isFinite(Number(input.servings)) && Number(input.servings) > 0
      ? Math.min(100, Math.round(Number(input.servings) * 2) / 2)
      : 0,
    ingredientsText,
    stepsText,
    allergyWarning: cleanLocalizedText(input.allergyWarning, 600),
    notes: cleanLocalizedText(input.notes, 2000),
    photos: cleanPhotos(input.photos),
    cardPhoto: cleanPhoto(input.cardPhoto),
    createdAt: new Date().toISOString(),
  };
}


async function readRecipes(store, householdId) {
  const indexKey = householdDataKey(householdId, INDEX_KEY);
  const legacyRecipesKey = householdDataKey(householdId, RECIPES_KEY);
  const index = (await store.get(indexKey, { type: "json" }).catch(() => [])) || [];
  const indexedRecipes = (await Promise.all(
    index
      .slice(0, MAX_RECIPES)
      .map((entry) => store.get(householdDataKey(householdId, `${RECIPE_PREFIX}${entry.id}`), { type: "json" }).catch(() => null))
  )).filter(Boolean);
  const indexedIds = new Set(indexedRecipes.map((recipe) => recipe.id));
  const legacyRecipes = ((await store.get(legacyRecipesKey, { type: "json" }).catch(() => [])) || [])
    .filter((recipe) => recipe?.id && !indexedIds.has(recipe.id));

  return [...indexedRecipes, ...legacyRecipes].slice(0, MAX_RECIPES);
}

async function readRecipeById(store, householdId, id) {
  if (typeof id !== "string" || !/^[a-z0-9-]{1,160}$/i.test(id)) return null;
  const indexed = await store
    .get(householdDataKey(householdId, `${RECIPE_PREFIX}${id}`), { type: "json" })
    .catch(() => null);
  if (indexed?.id === id) return indexed;
  const legacy = (await store
    .get(householdDataKey(householdId, RECIPES_KEY), { type: "json" })
    .catch(() => [])) || [];
  return legacy.find((recipe) => recipe?.id === id) || null;
}

function recipeCardMedia(recipe) {
  const explicit = cleanPhoto(recipe?.cardPhoto);
  const legacySingle = Array.isArray(recipe?.photos) && recipe.photos.length === 1
    ? cleanPhoto(recipe.photos[0])
    : "";
  return explicit || legacySingle;
}

async function writeRecipe(store, recipe, householdId) {
  const indexKey = householdDataKey(householdId, INDEX_KEY);
  const index = (await store.get(indexKey, { type: "json" }).catch(() => [])) || [];
  if (!index.some((entry) => entry?.id === recipe.id) && index.length >= MAX_RECIPES) {
    const error = new Error("Recipe library limit reached");
    error.code = "recipe-limit";
    throw error;
  }
  const nextIndex = [
      {
        id: recipe.id,
        name: localizedText(recipe.name, "en") || localizedText(recipe.name, "es"),
        category: recipe.category,
        createdAt: recipe.createdAt,
      },
    ...index.filter((entry) => entry?.id && entry.id !== recipe.id),
  ].slice(0, MAX_RECIPES);

  await store.setJSON(householdDataKey(householdId, `${RECIPE_PREFIX}${recipe.id}`), recipe);
  await store.setJSON(indexKey, nextIndex);
}

export default async (request) => {
  const store = getStore(STORE_NAME);
  const access = await requireHouseholdAccess(request);
  if (access.error) return access.error;

  if (request.method === "GET") {
    try {
      const params = new URL(request.url).searchParams;
      const view = params.get("view");
      const id = params.get("id");
      if (id) {
        const recipe = await readRecipeById(store, access.household.id, id);
        if (!recipe) return jsonResponse({ error: "Recipe not found" }, 404);
        if (view === "card") {
          return jsonResponse({ id: recipe.id, cardPhoto: recipeCardMedia(recipe) });
        }
        return jsonResponse({ recipe });
      }
      const recipes = await readRecipes(store, access.household.id);
      return jsonResponse({ recipes: view === "catalog" ? recipes.map(compactRecipeForCatalog).filter(Boolean) : recipes });
    } catch (error) {
      console.error(error);
      return jsonResponse({ error: "Could not load recipes" }, 500);
    }
  }

  if (request.method === "POST") {
    const { payload, error } = await readJsonRequest(request, { maxBytes: MAX_REQUEST_BYTES });
    if (error) return error;

    const recipe = cleanRecipe(payload);
    if (!recipe) {
      return jsonResponse({ error: "Recipe name, ingredients, and steps are required" }, 400);
    }

    try {
      await writeRecipe(store, recipe, access.household.id);
    } catch (error) {
      console.error(error);
      if (error.code === "recipe-limit") return jsonResponse({ error: "Your recipe library is full. Remove a recipe before adding another." }, 409);
      return jsonResponse({ error: "Could not save recipe" }, 500);
    }

    return jsonResponse({ recipe }, 201);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};
