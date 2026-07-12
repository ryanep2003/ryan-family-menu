import test from "node:test";
import assert from "node:assert/strict";
import {
  categoryFor,
  categoryLabel,
  recipeById,
  recipeToEditableUpload,
  uploadToRecipe,
  visibleRecipes,
} from "../recipe-utils.js";
import { recipes } from "../recipes-data.js";

const localizeEn = (value) => typeof value === "string" ? value : value.en;

test("uploadToRecipe normalizes shared uploads into display recipes", () => {
  const recipe = uploadToRecipe({
    id: "shared-1",
    name: { en: "Roasted carrots", es: "Zanahorias rostizadas" },
    category: "side",
    ingredientsText: { en: "1 lb carrots\nOlive oil", es: "1 libra de zanahorias\nAceite de oliva" },
    stepsText: { en: "Roast until browned.", es: "Hornear hasta dorar." },
    notes: { en: "Good warm.", es: "Buena tibia." },
    photos: [],
  }, "Shared upload", "Receta compartida");

  assert.equal(recipe.name.en, "Roasted carrots");
  assert.equal(recipe.name.es, "Zanahorias rostizadas");
  assert.equal(recipe.category, "side");
  assert.deepEqual(recipe.ingredients.en, ["1 lb carrots", "Olive oil"]);
  assert.deepEqual(recipe.ingredients.es, ["1 libra de zanahorias", "Aceite de oliva"]);
  assert.deepEqual(recipe.photos, []);
  assert.equal(recipe.cardPhoto, "assets/recipe-card-placeholder.jpg");
  assert.equal(recipe.cardPhotoIsPlaceholder, true);
});

test("uploadToRecipe does not copy English into missing Spanish fields", () => {
  const recipe = uploadToRecipe({
    id: "english-only",
    name: "Soup",
    ingredientsText: "beans",
    stepsText: "simmer",
  }, "Shared upload", "Receta compartida");

  assert.equal(recipe.name.es, "");
  assert.deepEqual(recipe.ingredients.es, []);
  assert.deepEqual(recipe.steps.es, []);
});

test("uploadToRecipe keeps scanned source photos out of recipe cards", () => {
  const recipe = uploadToRecipe({
    id: "scanned-pages",
    name: "Carnitas",
    ingredientsText: "pork",
    stepsText: "cook",
    photos: ["data:image/jpeg;base64,scan-page"],
  }, "Shared upload", "Receta compartida");

  assert.deepEqual(recipe.photos, ["data:image/jpeg;base64,scan-page"]);
  assert.equal(recipe.cardPhoto, "assets/recipe-card-placeholder.jpg");
  assert.equal(recipe.cardPhotoIsPlaceholder, true);
});

test("uploadToRecipe preserves an explicit curated card photo", () => {
  const recipe = uploadToRecipe({
    id: "curated-upload",
    name: "Carnitas",
    ingredientsText: "pork",
    stepsText: "cook",
    photos: ["data:image/jpeg;base64,scan-page"],
    cardPhoto: "assets/card-pot-roast.jpg",
  }, "Shared upload", "Receta compartida");

  assert.equal(recipe.cardPhoto, "assets/card-pot-roast.jpg");
  assert.equal(recipe.cardPhotoIsPlaceholder, false);
});

test("recipeToEditableUpload converts display recipes back to edit form values", () => {
  const editable = recipeToEditableUpload({
    id: "shared-1",
    name: { en: "Roasted carrots", es: "Zanahorias rostizadas" },
    category: "side",
    ingredients: { en: ["1 lb carrots", "Olive oil"] },
    steps: { en: ["Roast until browned."] },
    notes: { en: "Good warm." },
    cardPhoto: "card-photo.jpg",
    photos: ["photo.jpg"],
  }, "en", localizeEn);

  assert.equal(editable.name, "Roasted carrots");
  assert.equal(editable.category, "side");
  assert.equal(editable.ingredientsText, "1 lb carrots\nOlive oil");
  assert.equal(editable.cardPhoto, "card-photo.jpg");
  assert.deepEqual(editable.photos, ["photo.jpg"]);
});

test("category helpers preserve seeded categories and labels", () => {
  assert.equal(categoryFor({ id: "zaatar-parmesan-potatoes" }), "side");
  assert.equal(categoryLabel("salad", localizeEn), "Salad");
  assert.equal(categoryLabel("dessert", localizeEn), "Dessert");
});

test("visibleRecipes combines shared uploads, drafts, edits, and deletions", () => {
  const recipes = visibleRecipes({
    seedRecipes: [
      { id: "seed-1", name: { en: "Seed" }, meta: { en: "Seed meta", es: "Meta" }, cardPhoto: "seed-card.jpg" },
      { id: "deleted-1", name: { en: "Deleted" } },
    ],
    sharedRecipes: [
      { id: "shared-1", name: "Shared", ingredientsText: "beans", stepsText: "cook" },
    ],
    drafts: [
      { id: "draft-1", name: "Draft", ingredientsText: "", stepsText: "" },
    ],
    recipeEdits: {
      "seed-1": { id: "seed-1", name: "Edited seed", ingredientsText: "rice", stepsText: "steam" },
    },
    deletedRecipeIds: ["deleted-1"],
    localize: localizeEn,
  });

  assert.deepEqual(recipes.map((recipe) => recipe.id), ["seed-1", "shared-1", "draft-1"]);
  assert.equal(recipes[0].name.en, "Edited seed");
  assert.equal(recipes[0].cardPhoto, "seed-card.jpg");
  assert.equal(recipes[1].meta.en, "Shared upload");
  assert.equal(recipes[2].meta.en, "Local draft");
});

test("recipeById returns selected recipe or sensible fallbacks", () => {
  const fallback = { id: "fallback" };
  const first = { id: "first" };

  assert.deepEqual(recipeById([first], "first", [fallback]), first);
  assert.deepEqual(recipeById([first], "missing", [fallback]), first);
  assert.deepEqual(recipeById([], "missing", [fallback]), fallback);
  assert.equal(recipeById([], "missing", []), null);
});

test("seed recipes use polished Spanish and dedicated discovery photos", () => {
  const meatballs = recipes.find((recipe) => recipe.id === "meatballs");
  const soup = recipes.find((recipe) => recipe.id === "chicken-noodle-soup");

  assert.match(meatballs.name.es, /albóndigas/);
  assert.match(soup.short.es, /cúrcuma/);
  assert.equal(meatballs.cardPhoto, "assets/meatballs-2.jpg");
  assert.equal(meatballs.photos[0], "assets/meatballs-1.jpg");
  assert.equal(soup.cardPhoto, "assets/card-chicken-noodle-soup.jpg");
  assert.equal(soup.photos[0], "assets/chicken-noodle-soup-1.jpg");
  assert.equal(recipes.every((recipe) => recipe.cardPhoto), true);
  assert.equal(new Set(recipes.map((recipe) => recipe.cardPhoto)).size, recipes.length);
});
