import { getStore } from "@netlify/blobs";
import { requireWriteAuth } from "./_auth.js";
import { jsonResponse, readJsonRequest } from "./_http.js";
import { cleanLocalizedText, hasLocalizedContent, localizedText } from "../../localized-data.js";

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
  if (/^assets\/[a-z0-9-]+\.jpe?g$/i.test(photo)) return photo;
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
    ingredientsText,
    stepsText,
    allergyWarning: cleanLocalizedText(input.allergyWarning, 600),
    notes: cleanLocalizedText(input.notes, 2000),
    photos: cleanPhotos(input.photos),
    cardPhoto: cleanPhoto(input.cardPhoto),
    createdAt: new Date().toISOString(),
  };
}

async function readRecipes(store) {
  const index = (await store.get(INDEX_KEY, { type: "json" }).catch(() => [])) || [];
  const indexedRecipes = (await Promise.all(
    index
      .slice(0, MAX_RECIPES)
      .map((entry) => store.get(`${RECIPE_PREFIX}${entry.id}`, { type: "json" }).catch(() => null))
  )).filter(Boolean);
  const indexedIds = new Set(indexedRecipes.map((recipe) => recipe.id));
  const legacyRecipes = ((await store.get(RECIPES_KEY, { type: "json" }).catch(() => [])) || [])
    .filter((recipe) => recipe?.id && !indexedIds.has(recipe.id));

  return [...indexedRecipes, ...legacyRecipes].slice(0, MAX_RECIPES);
}

async function writeRecipe(store, recipe) {
  const index = (await store.get(INDEX_KEY, { type: "json" }).catch(() => [])) || [];
  const nextIndex = [
      {
        id: recipe.id,
        name: localizedText(recipe.name, "en") || localizedText(recipe.name, "es"),
        category: recipe.category,
        createdAt: recipe.createdAt,
      },
    ...index.filter((entry) => entry?.id && entry.id !== recipe.id),
  ].slice(0, MAX_RECIPES);

  await store.setJSON(`${RECIPE_PREFIX}${recipe.id}`, recipe);
  await store.setJSON(INDEX_KEY, nextIndex);
}

export default async (request) => {
  const store = getStore(STORE_NAME);

  if (request.method === "GET") {
    try {
      const recipes = await readRecipes(store);
      return jsonResponse({ recipes });
    } catch (error) {
      console.error(error);
      return jsonResponse({ error: "Could not load recipes" }, 500);
    }
  }

  if (request.method === "POST") {
    const authError = requireWriteAuth(request);
    if (authError) return authError;

    const { payload, error } = await readJsonRequest(request, { maxBytes: MAX_REQUEST_BYTES });
    if (error) return error;

    const recipe = cleanRecipe(payload);
    if (!recipe) {
      return jsonResponse({ error: "Recipe name, ingredients, and steps are required" }, 400);
    }

    try {
      await writeRecipe(store, recipe);
    } catch (error) {
      console.error(error);
      return jsonResponse({ error: "Could not save recipe" }, 500);
    }

    return jsonResponse({ recipe }, 201);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};
