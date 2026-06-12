import { getStore } from "@netlify/blobs";

const STORE_NAME = "family-menu-recipes";
const RECIPES_KEY = "recipes";
const MAX_PHOTOS = 3;
const MAX_TEXT_LENGTH = 12000;

const jsonHeaders = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function cleanText(value, limit = MAX_TEXT_LENGTH) {
  return `${value || ""}`.trim().slice(0, limit);
}

function cleanPhotos(photos) {
  if (!Array.isArray(photos)) return [];
  return photos
    .filter((photo) => typeof photo === "string" && photo.startsWith("data:image/"))
    .slice(0, MAX_PHOTOS);
}

function cleanRecipe(input) {
  const name = cleanText(input.name, 120);
  if (!name) return null;

  const category = ["main", "side", "salad", "sauce"].includes(input.category)
    ? input.category
    : "main";

  return {
    id: `shared-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    category,
    ingredientsText: cleanText(input.ingredientsText),
    stepsText: cleanText(input.stepsText),
    allergyWarning: cleanText(input.allergyWarning, 600),
    notes: cleanText(input.notes, 2000),
    photos: cleanPhotos(input.photos),
    createdAt: new Date().toISOString(),
  };
}

async function readRecipes(store) {
  return (await store.get(RECIPES_KEY, { type: "json" })) || [];
}

export default async (request) => {
  const store = getStore(STORE_NAME);

  if (request.method === "GET") {
    const recipes = await readRecipes(store);
    return jsonResponse({ recipes });
  }

  if (request.method === "POST") {
    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    const recipe = cleanRecipe(payload);
    if (!recipe) {
      return jsonResponse({ error: "Recipe name is required" }, 400);
    }

    const recipes = await readRecipes(store);
    recipes.unshift(recipe);
    await store.setJSON(RECIPES_KEY, recipes);

    return jsonResponse({ recipe }, 201);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};
