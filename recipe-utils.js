import { localizedTextExact } from "./localized-data.js";

const DEFAULT_CARD_PHOTO = "assets/recipe-card-placeholder.jpg";

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
  const lines = (text || "").split("\n").map((line) => line.trim()).filter(Boolean);
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

export function categoryLabel(category, localize) {
  return localize(categoryLabels[category] || categoryLabels.main);
}

export function uploadToRecipe(upload, enMeta, esMeta) {
  const photos = upload.photos?.length ? upload.photos : [];
  const hasCardPhoto = typeof upload.cardPhoto === "string"
    && upload.cardPhoto.trim()
    && upload.cardPhoto !== DEFAULT_CARD_PHOTO;
  return {
    ...upload,
    name: localizedPair(upload.name),
    meta: { en: enMeta, es: esMeta },
    short: localizedPair(upload.notes, "Needs review", "Necesita revisión"),
    tags: { en: enMeta, es: esMeta },
    category: upload.category || "draft",
    allergyWarning: upload.allergyWarning
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
    cardPhotoIsPlaceholder: !hasCardPhoto,
  };
}

export function recipeToEditableUpload(recipe, lang, localize) {
  return {
    id: recipe.id,
    name: localize(recipe.name),
    category: categoryFor(recipe),
    ingredientsText: (recipe.ingredients?.[lang] || []).join("\n"),
    stepsText: (recipe.steps?.[lang] || []).join("\n"),
    allergyWarning: recipe.allergyWarning ? localize(recipe.allergyWarning) : "",
    notes: localize(recipe.notes),
    photos: recipe.photos || [],
    cardPhoto: recipe.cardPhoto
      || (recipe.cardPhotoIsPlaceholder ? DEFAULT_CARD_PHOTO : recipe.photos?.[0] || DEFAULT_CARD_PHOTO),
    updatedAt: new Date().toISOString(),
  };
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
  return [
    ...(seedRecipes || []),
    ...(sharedRecipes || []).map((recipe) => uploadToRecipe(recipe, "Shared upload", "Receta compartida")),
    ...(drafts || []).map((draft) => uploadToRecipe(draft, "Local draft", "Borrador local")),
  ]
    .filter((recipe) => !deletedIds.has(recipe.id))
    .map((recipe) => {
      const edit = recipeEdits?.[recipe.id];
      if (!edit) return recipe;
      const normalized = uploadToRecipe(edit, recipe.meta?.en || localize(recipe.meta), recipe.meta?.es || localize(recipe.meta));
      return {
        ...normalized,
        cardPhoto: edit.cardPhoto || recipe.cardPhoto || normalized.cardPhoto,
        cardPhotoIsPlaceholder: edit.cardPhoto
          ? false
          : recipe.cardPhotoIsPlaceholder ?? normalized.cardPhotoIsPlaceholder,
      };
    });
}

export function recipeById(recipes, id, fallbackRecipes = []) {
  return recipes.find((recipe) => recipe.id === id) || recipes[0] || fallbackRecipes[0] || null;
}
