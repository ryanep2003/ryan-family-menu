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

const localizeEn = (value) => typeof value === "string" ? value : value.en;

test("uploadToRecipe normalizes shared uploads into display recipes", () => {
  const recipe = uploadToRecipe({
    id: "shared-1",
    name: "Roasted carrots",
    category: "side",
    ingredientsText: "1 lb carrots\nOlive oil",
    stepsText: "Roast until browned.",
    notes: "Good warm.",
    photos: [],
  }, "Shared upload", "Receta compartida");

  assert.equal(recipe.name.en, "Roasted carrots");
  assert.equal(recipe.category, "side");
  assert.deepEqual(recipe.ingredients.en, ["1 lb carrots", "Olive oil"]);
  assert.deepEqual(recipe.photos, ["assets/meatballs-2.jpg"]);
});

test("recipeToEditableUpload converts display recipes back to edit form values", () => {
  const editable = recipeToEditableUpload({
    id: "shared-1",
    name: { en: "Roasted carrots", es: "Zanahorias rostizadas" },
    category: "side",
    ingredients: { en: ["1 lb carrots", "Olive oil"] },
    steps: { en: ["Roast until browned."] },
    notes: { en: "Good warm." },
    photos: ["photo.jpg"],
  }, "en", localizeEn);

  assert.equal(editable.name, "Roasted carrots");
  assert.equal(editable.category, "side");
  assert.equal(editable.ingredientsText, "1 lb carrots\nOlive oil");
  assert.deepEqual(editable.photos, ["photo.jpg"]);
});

test("category helpers preserve seeded categories and labels", () => {
  assert.equal(categoryFor({ id: "zaatar-parmesan-potatoes" }), "side");
  assert.equal(categoryLabel("salad", localizeEn), "Salad");
});

test("visibleRecipes combines shared uploads, drafts, edits, and deletions", () => {
  const recipes = visibleRecipes({
    seedRecipes: [
      { id: "seed-1", name: { en: "Seed" }, meta: { en: "Seed meta", es: "Meta" } },
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
