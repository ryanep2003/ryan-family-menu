import { localizedText } from "./localized-data.js";

const FALLBACK_PHOTO = "assets/meatballs-2.jpg";

const categoryLabels = {
  main: { en: "Main", es: "Principal" },
  side: { en: "Side", es: "Guarnicion" },
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
  return lines.length ? lines : [fallback];
}

function localizedPair(value, enFallback = "", esFallback = "") {
  return {
    en: localizedText(value, "en") || enFallback,
    es: localizedText(value, "es") || esFallback,
  };
}

export function categoryFor(recipe) {
  return recipe.category || recipeCategories[recipe.id] || "main";
}

export function categoryLabel(category, localize) {
  return localize(categoryLabels[category] || categoryLabels.main);
}

export function uploadToRecipe(upload, enMeta, esMeta) {
  return {
    ...upload,
    name: localizedPair(upload.name),
    meta: { en: enMeta, es: esMeta },
    short: localizedPair(upload.notes, "Needs review", "Necesita revision"),
    tags: { en: enMeta, es: esMeta },
    category: upload.category || "draft",
    allergyWarning: upload.allergyWarning
      ? localizedPair(upload.allergyWarning)
      : undefined,
    ingredients: {
      en: splitLines(localizedText(upload.ingredientsText, "en"), "Add ingredients after review."),
      es: splitLines(localizedText(upload.ingredientsText, "es"), "Agrega ingredientes despues de revisar."),
    },
    steps: {
      en: splitLines(localizedText(upload.stepsText, "en"), "Add cooking steps after review."),
      es: splitLines(localizedText(upload.stepsText, "es"), "Agrega los pasos despues de revisar."),
    },
    notes: localizedPair(upload.notes, "No notes yet.", "Sin notas todavia."),
    photos: upload.photos?.length ? upload.photos : [FALLBACK_PHOTO],
  };
}

export function recipeToEditableUpload(recipe, lang, localize) {
  return {
    id: recipe.id,
    name: localize(recipe.name),
    category: categoryFor(recipe),
    ingredientsText: (recipe.ingredients?.[lang] || recipe.ingredients?.en || []).join("\n"),
    stepsText: (recipe.steps?.[lang] || recipe.steps?.en || []).join("\n"),
    allergyWarning: recipe.allergyWarning ? localize(recipe.allergyWarning) : "",
    notes: localize(recipe.notes),
    photos: recipe.photos || [FALLBACK_PHOTO],
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
      return uploadToRecipe(edit, recipe.meta?.en || localize(recipe.meta), recipe.meta?.es || localize(recipe.meta));
    });
}

export function recipeById(recipes, id, fallbackRecipes = []) {
  return recipes.find((recipe) => recipe.id === id) || recipes[0] || fallbackRecipes[0] || null;
}
