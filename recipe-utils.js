const FALLBACK_PHOTO = "assets/meatballs-2.jpg";

const categoryLabels = {
  main: { en: "Main", es: "Principal" },
  side: { en: "Side", es: "Guarnicion" },
  salad: { en: "Salad", es: "Ensalada" },
  sauce: { en: "Sauce", es: "Salsa" },
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

export function categoryFor(recipe) {
  return recipe.category || recipeCategories[recipe.id] || "main";
}

export function categoryLabel(category, localize) {
  return localize(categoryLabels[category] || categoryLabels.main);
}

export function uploadToRecipe(upload, enMeta, esMeta) {
  return {
    ...upload,
    name: { en: upload.name, es: upload.name },
    meta: { en: enMeta, es: esMeta },
    short: { en: upload.notes || "Needs review", es: upload.notes || "Necesita revision" },
    tags: { en: enMeta, es: esMeta },
    category: upload.category || "draft",
    allergyWarning: upload.allergyWarning
      ? { en: upload.allergyWarning, es: upload.allergyWarning }
      : undefined,
    ingredients: {
      en: splitLines(upload.ingredientsText, "Add ingredients after review."),
      es: splitLines(upload.ingredientsText, "Agrega ingredientes despues de revisar."),
    },
    steps: {
      en: splitLines(upload.stepsText, "Add cooking steps after review."),
      es: splitLines(upload.stepsText, "Agrega los pasos despues de revisar."),
    },
    notes: { en: upload.notes || "No notes yet.", es: upload.notes || "Sin notas todavia." },
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
