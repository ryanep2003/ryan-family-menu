import { getStore } from "@netlify/blobs";
import { householdDataKey, requireHouseholdAccess } from "./_household.js";
import { jsonResponse, readJsonRequest } from "./_http.js";
import { cleanLocalizedText, hasLocalizedContent, localizedText } from "../../localized-data.js";
import { compactRecipeForCatalog } from "../../recipe-catalog-utils.js";
import { categoryFor, servingsForRecipe } from "../../recipe-utils.js";
import { recipes as starterRecipes } from "../../recipes-data.js";

const STORE_NAME = "family-menu-recipes";
const RECIPES_KEY = "recipes";
const INDEX_KEY = "recipe-index";
const RECIPE_PREFIX = "recipe:";
// Platform-owned recipes are shared read-only catalog records. Household
// records remain the source of truth for anything a family publishes or edits.
const PLATFORM_INDEX_KEY = "platform:recipe-index";
const PLATFORM_RECIPE_PREFIX = "platform:recipe:";
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

function cleanAssetPhotos(photos) {
  if (!Array.isArray(photos)) return [];
  return photos
    .map((photo) => cleanPhoto(photo))
    .filter(Boolean)
    .slice(0, MAX_PHOTOS);
}

function starterRecipeRecord(recipe) {
  return {
    id: recipe.id,
    name: cleanLocalizedText(recipe.name, 120),
    category: categoryFor(recipe),
    servings: servingsForRecipe(recipe),
    ingredientsText: cleanLocalizedText({
      en: Array.isArray(recipe.ingredients?.en) ? recipe.ingredients.en.join("\n") : "",
      es: Array.isArray(recipe.ingredients?.es) ? recipe.ingredients.es.join("\n") : "",
    }, MAX_TEXT_LENGTH),
    stepsText: cleanLocalizedText({
      en: Array.isArray(recipe.steps?.en) ? recipe.steps.en.join("\n") : "",
      es: Array.isArray(recipe.steps?.es) ? recipe.steps.es.join("\n") : "",
    }, MAX_TEXT_LENGTH),
    allergyWarning: cleanLocalizedText(recipe.allergyWarning, 600),
    notes: cleanLocalizedText(recipe.notes, 2000),
    meta: cleanLocalizedText(recipe.meta, 300),
    short: cleanLocalizedText(recipe.short, 900),
    tags: cleanLocalizedText(recipe.tags, 500),
    photos: cleanAssetPhotos(recipe.photos),
    cardPhoto: cleanPhoto(recipe.cardPhoto),
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const STARTER_RECIPE_RECORDS = starterRecipes.map(starterRecipeRecord).filter((recipe) =>
  recipe.id && hasLocalizedContent(recipe.name) && hasLocalizedContent(recipe.ingredientsText) && hasLocalizedContent(recipe.stepsText)
);

function platformIndexEntry(recipe) {
  return {
    id: recipe.id,
    name: localizedText(recipe.name, "en") || localizedText(recipe.name, "es"),
    category: recipe.category,
    createdAt: recipe.createdAt,
  };
}

async function ensurePlatformCatalog(store) {
  const existingIndex = await store.get(PLATFORM_INDEX_KEY, { type: "json" }).catch(() => []);
  const index = Array.isArray(existingIndex) ? existingIndex.filter((entry) => entry?.id) : [];
  const existingIds = new Set(index.map((entry) => entry.id));
  const missing = STARTER_RECIPE_RECORDS.filter((recipe) => !existingIds.has(recipe.id));

  if (missing.length) {
    await Promise.all(missing.map((recipe) => store.setJSON(`${PLATFORM_RECIPE_PREFIX}${recipe.id}`, recipe)));
    await store.setJSON(PLATFORM_INDEX_KEY, [
      ...missing.map(platformIndexEntry),
      ...index,
    ].slice(0, MAX_RECIPES));
  }

  return missing.length ? [
    ...missing.map(platformIndexEntry),
    ...index,
  ].slice(0, MAX_RECIPES) : index.slice(0, MAX_RECIPES);
}

async function readPlatformRecipes(store) {
  const index = await ensurePlatformCatalog(store);
  return (await Promise.all(
    index.map((entry) => store.get(`${PLATFORM_RECIPE_PREFIX}${entry.id}`, { type: "json" }).catch(() => null))
  )).filter((recipe) => recipe?.id).slice(0, MAX_RECIPES);
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

async function readRecipeById(store, householdId, id, platformRecipes = []) {
  if (typeof id !== "string" || !/^[a-z0-9-]{1,160}$/i.test(id)) return null;
  const indexed = await store
    .get(householdDataKey(householdId, `${RECIPE_PREFIX}${id}`), { type: "json" })
    .catch(() => null);
  if (indexed?.id === id) return indexed;
  const legacy = (await store
    .get(householdDataKey(householdId, RECIPES_KEY), { type: "json" })
    .catch(() => [])) || [];
  return legacy.find((recipe) => recipe?.id === id)
    || platformRecipes.find((recipe) => recipe?.id === id)
    || null;
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
      const platformRecipes = await readPlatformRecipes(store);
      if (id) {
        const recipe = await readRecipeById(store, access.household.id, id, platformRecipes);
        if (!recipe) return jsonResponse({ error: "Recipe not found" }, 404);
        if (view === "card") {
          return jsonResponse({ id: recipe.id, cardPhoto: recipeCardMedia(recipe) });
        }
        return jsonResponse({ recipe });
      }
      const householdRecipes = await readRecipes(store, access.household.id);
      const householdIds = new Set(householdRecipes.map((recipe) => recipe.id));
      const recipes = [
        ...householdRecipes,
        ...platformRecipes.filter((recipe) => !householdIds.has(recipe.id)),
      ].slice(0, MAX_RECIPES);
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
