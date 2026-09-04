import { hasLocalizedContent, isMeaningfulText, localizedTextExact } from "./localized-data.js";

const DEFAULT_CARD_PHOTO = "assets/recipe-card-placeholder.webp";

function hasExplicitCardPhoto(value) {
  return typeof value === "string"
    && value.trim()
    && value !== DEFAULT_CARD_PHOTO;
}

function recipeHash(value) {
  return [...`${value || "recipe"}`].reduce((hash, character) => (
    ((hash << 5) - hash + character.charCodeAt(0)) | 0
  ), 0) >>> 0;
}

function generatedCardPhoto(recipe) {
  const identity = `${recipe?.id || "recipe"}:${localizedTextExact(recipe?.name, "en") || localizedTextExact(recipe?.name, "es") || "recipe"}`;
  const hash = recipeHash(identity);
  const hue = hash % 360;
  const accent = (hue + 52) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420" data-recipe="${encodeURIComponent(identity)}"><rect width="640" height="420" fill="hsl(${hue} 24% 91%)"/><circle cx="520" cy="95" r="130" fill="hsl(${accent} 42% 82%)" opacity=".72"/><ellipse cx="320" cy="236" rx="190" ry="92" fill="hsl(${hue} 18% 98%)" stroke="hsl(${hue} 22% 74%)" stroke-width="8"/><ellipse cx="320" cy="236" rx="132" ry="54" fill="hsl(${accent} 45% 66%)"/><circle cx="258" cy="222" r="24" fill="hsl(${hue} 62% 48%)"/><circle cx="326" cy="250" r="27" fill="hsl(${accent} 67% 42%)"/><circle cx="388" cy="220" r="21" fill="hsl(${hue} 70% 58%)"/><path d="M180 105c38-54 90-62 132-25-28 8-53 32-66 65-25-3-47-16-66-40Z" fill="hsl(${accent} 36% 42%)"/><path d="M448 304c42-35 84-34 112-5-33 3-58 22-77 53-18-9-29-25-35-48Z" fill="hsl(${hue} 42% 43%)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const categoryLabels = {
  main: { en: "Main", es: "Principal" },
  side: { en: "Side", es: "Guarnición" },
  salad: { en: "Salad", es: "Ensalada" },
  sauce: { en: "Sauce", es: "Salsa" },
  dessert: { en: "Dessert", es: "Postre" },
  draft: { en: "Draft", es: "Borrador" },
};

const recipeCategories = {
  meatballs: "main",
  "chicken-milanese": "main",
  "halibut-summer-vegetables": "main",
  "lemon-chicken": "main",
  "zaatar-parmesan-potatoes": "side",
  "lemon-bucatini-pasta": "main",
  "pasta-with-meat-sauce": "main",
  "strawberry-crunch-salad": "salad",
  "roasted-brussels-sprouts-salad": "salad",
  "chicken-noodle-soup": "main",
  "ina-garten-pot-roast": "main",
  "basil-pesto-pasta": "main",
};

function splitLines(text, fallback) {
  const lines = (text || "").split("\n").map((line) => line.trim()).filter((line) => isMeaningfulText(line));
  return lines.length ? lines : fallback ? [fallback] : [];
}

function localizedPair(value, enFallback = "", esFallback = "") {
  return {
    en: localizedTextExact(value, "en") || enFallback,
    es: localizedTextExact(value, "es") || esFallback,
  };
}

export function categoryFor(recipe) {
  return recipe.category || recipeCategories[recipe.id] || "main";
}

export function normalizeRecipeServings(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(100, Math.round(number * 2) / 2);
}

export function servingsForRecipe(recipe) {
  const explicit = normalizeRecipeServings(recipe?.servings);
  if (explicit) return explicit;
  const meta = localizedTextExact(recipe?.meta, "en");
  const match = meta.match(/\bserves?\s+(\d+(?:\.\d+)?)/i);
  return normalizeRecipeServings(match?.[1]);
}

export function categoryLabel(category, localize) {
  return localize(categoryLabels[category] || categoryLabels.main);
}

export function cardPhotoFor(recipe) {
  if (hasExplicitCardPhoto(recipe?.cardPhoto)) return recipe.cardPhoto;
  // A single legacy/imported photo is likely a finished-dish image. Multi-page
  // uploads are kept as source photos so recipe scans do not become card art.
  if (recipe?.photos?.length === 1 && recipe.photos[0]) return recipe.photos[0];
  return generatedCardPhoto(recipe);
}

export function cardPhotoIsGenerated(recipe) {
  return !hasExplicitCardPhoto(recipe?.cardPhoto) && !(recipe?.photos?.length === 1 && recipe.photos[0]);
}

export function uploadToRecipe(upload, enMeta, esMeta) {
  const photos = upload.photos?.length ? upload.photos : [];
  const hasCardPhoto = hasExplicitCardPhoto(upload.cardPhoto);
  return {
    ...upload,
    name: localizedPair(upload.name),
    meta: upload.meta || { en: enMeta, es: esMeta },
    short: upload.short || localizedPair(upload.notes, "Needs review", "Necesita revisión"),
    tags: upload.tags || { en: enMeta, es: esMeta },
    category: upload.category || "draft",
    servings: normalizeRecipeServings(upload.servings),
    allergyWarning: hasLocalizedContent(upload.allergyWarning)
      ? localizedPair(upload.allergyWarning)
      : undefined,
    ingredients: {
      en: splitLines(localizedTextExact(upload.ingredientsText, "en"), "Add ingredients after review."),
      es: splitLines(localizedTextExact(upload.ingredientsText, "es"), ""),
    },
    steps: {
      en: splitLines(localizedTextExact(upload.stepsText, "en"), "Add cooking steps after review."),
      es: splitLines(localizedTextExact(upload.stepsText, "es"), ""),
    },
    notes: localizedPair(upload.notes, "No notes yet.", "Sin notas todavía."),
    photos,
    cardPhoto: hasCardPhoto ? upload.cardPhoto : DEFAULT_CARD_PHOTO,
    cardPhotoIsPlaceholder: !hasCardPhoto && photos.length !== 1,
  };
}

export function recipeToEditableUpload(recipe, lang, localize) {
  return {
    id: recipe.id,
    name: localize(recipe.name),
    category: categoryFor(recipe),
    servings: servingsForRecipe(recipe),
    ingredientsText: (recipe.ingredients?.[lang] || []).join("\n"),
    stepsText: (recipe.steps?.[lang] || []).join("\n"),
    allergyWarning: recipe.allergyWarning ? localize(recipe.allergyWarning) : "",
    notes: localize(recipe.notes),
    photos: recipe.photos || [],
    cardPhoto: hasExplicitCardPhoto(recipe.cardPhoto)
      ? recipe.cardPhoto
      : recipe.photos?.length === 1 ? recipe.photos[0] : DEFAULT_CARD_PHOTO,
    updatedAt: new Date().toISOString(),
  };
}

function samePhotoList(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((photo, index) => photo === right[index]);
}

export function compactRecipeEditsForSync(recipeEdits = {}, sharedRecipes = []) {
  const sharedById = new Map(sharedRecipes.map((recipe) => [recipe.id, recipe]));

  return Object.fromEntries(Object.entries(recipeEdits).map(([id, edit]) => {
    const shared = sharedById.get(id);
    if (!shared || !edit || typeof edit !== "object") return [id, edit];

    const compact = { ...edit };
    if (samePhotoList(compact.photos, shared.photos)) delete compact.photos;
    if (compact.cardPhoto && (
      compact.cardPhoto === shared.cardPhoto
      || (!shared.cardPhoto && compact.cardPhoto === shared.photos?.[0])
    )) {
      delete compact.cardPhoto;
    }
    return [id, compact];
  }));
}

export function visibleRecipes({
  seedRecipes,
  sharedRecipes,
  drafts,
  recipeEdits,
  deletedRecipeIds,
  localize,
}) {
  const deletedIds = new Set(deletedRecipeIds || []);
  const byId = new Map();
  (seedRecipes || []).forEach((recipe) => {
    if (recipe?.id) byId.set(recipe.id, recipe);
  });
  (sharedRecipes || []).forEach((recipe) => {
    if (recipe?.id) byId.set(recipe.id, uploadToRecipe(recipe, "Shared upload", "Receta compartida"));
  });
  (drafts || []).forEach((draft) => {
    if (draft?.id) byId.set(draft.id, uploadToRecipe(draft, "Local draft", "Borrador local"));
  });
  return [...byId.values()]
    .filter((recipe) => !deletedIds.has(recipe.id))
    .map((recipe) => {
      const edit = recipeEdits?.[recipe.id];
      if (!edit) return recipe;
      const editWithMedia = {
        ...edit,
        photos: edit.photos?.length ? edit.photos : recipe.photos || [],
        cardPhoto: hasExplicitCardPhoto(edit.cardPhoto) ? edit.cardPhoto : recipe.cardPhoto || "",
      };
      const normalized = uploadToRecipe(editWithMedia, recipe.meta?.en || localize(recipe.meta), recipe.meta?.es || localize(recipe.meta));
      const editedCardPhoto = hasExplicitCardPhoto(edit.cardPhoto);
      const existingCardPhoto = hasExplicitCardPhoto(recipe.cardPhoto);
      return {
        ...normalized,
        cardPhoto: editedCardPhoto ? edit.cardPhoto : existingCardPhoto ? recipe.cardPhoto : DEFAULT_CARD_PHOTO,
        cardPhotoIsPlaceholder: !editedCardPhoto && !existingCardPhoto && normalized.photos.length !== 1,
      };
    });
}

export function recipeById(recipes, id, fallbackRecipes = []) {
  return recipes.find((recipe) => recipe.id === id) || recipes[0] || fallbackRecipes[0] || null;
}
