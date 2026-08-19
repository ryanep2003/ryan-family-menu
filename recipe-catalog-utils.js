function safeCardPhoto(value) {
  if (typeof value !== "string") return "";
  return /^assets\/[a-z0-9-]+\.(?:jpe?g|webp)$/i.test(value.trim()) ? value.trim() : "";
}

export function compactRecipeForCatalog(recipe) {
  if (!recipe || typeof recipe !== "object") return null;
  const compact = {
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    servings: recipe.servings,
    ingredientsText: recipe.ingredientsText,
    stepsText: recipe.stepsText,
    allergyWarning: recipe.allergyWarning,
    notes: recipe.notes,
    createdAt: recipe.createdAt,
  };
  const cardPhoto = safeCardPhoto(recipe.cardPhoto);
  if (cardPhoto) compact.cardPhoto = cardPhoto;
  compact.hasSourcePhotos = (Array.isArray(recipe.photos) && recipe.photos.length > 0)
    || Boolean(typeof recipe.cardPhoto === "string" && recipe.cardPhoto.startsWith("data:image/"));
  return compact;
}
