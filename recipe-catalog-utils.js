function safeCardPhoto(value) {
  if (typeof value !== "string") return "";
  return /^assets\/[a-z0-9-]+\.(?:jpe?g|webp)$/i.test(value.trim()) ? value.trim() : "";
}

function textFromLegacy(value) {
  if (typeof value === "string") return { en: value, es: value };
  if (!value || typeof value !== "object") return { en: "", es: "" };
  return Object.fromEntries(["en", "es"].map((lang) => [
    lang,
    Array.isArray(value[lang]) ? value[lang].filter((line) => typeof line === "string").join("\n") : `${value[lang] || ""}`,
  ]));
}

export function compactRecipeForCatalog(recipe) {
  if (!recipe || typeof recipe !== "object") return null;
  const compact = {
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    servings: recipe.servings,
    ingredientsText: recipe.ingredientsText || textFromLegacy(recipe.ingredients),
    stepsText: recipe.stepsText || textFromLegacy(recipe.steps),
    allergyWarning: recipe.allergyWarning,
    notes: recipe.notes,
    meta: recipe.meta,
    short: recipe.short,
    tags: recipe.tags,
    createdAt: recipe.createdAt,
  };
  const cardPhoto = safeCardPhoto(recipe.cardPhoto);
  if (cardPhoto) compact.cardPhoto = cardPhoto;
  compact.hasSourcePhotos = (Array.isArray(recipe.photos) && recipe.photos.length > 0)
    || Boolean(typeof recipe.cardPhoto === "string" && recipe.cardPhoto.startsWith("data:image/"));
  return compact;
}

export function recipesFromCatalogResponse(value) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();
  value.forEach((recipe) => {
    if (!recipe || typeof recipe !== "object" || typeof recipe.id !== "string" || !recipe.id.trim()) return;
    byId.set(recipe.id, recipe);
  });
  return [...byId.values()];
}
