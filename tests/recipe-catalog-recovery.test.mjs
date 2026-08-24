import test from "node:test";
import assert from "node:assert/strict";
import { compactRecipeForCatalog, recipesFromCatalogResponse } from "../recipe-catalog-utils.js";
import { getJson } from "../api.js";
import { readFile } from "node:fs/promises";

test("compact catalog keeps cooking fields and removes embedded photos", () => {
  const full = {
    id: "shared-1",
    name: { en: "Soup", es: "Sopa" },
    category: "main",
    servings: 4,
    ingredientsText: { en: "1 onion", es: "1 cebolla" },
    stepsText: { en: "Cook it", es: "Cocinar" },
    allergyWarning: { en: "", es: "" },
    notes: { en: "Family favorite", es: "Favorito" },
    meta: { en: "Family favorite", es: "Favorito" },
    createdAt: "2026-08-19T00:00:00.000Z",
    photos: ["data:image/jpeg;base64," + "x".repeat(1000)],
    cardPhoto: "data:image/jpeg;base64," + "y".repeat(1000),
  };
  const compact = compactRecipeForCatalog(full);
  assert.equal(compact.id, full.id);
  assert.equal(compact.ingredientsText.en, "1 onion");
  assert.equal(compact.stepsText.es, "Cocinar");
  assert.equal(compact.meta.en, "Family favorite");
  assert.equal(compact.hasSourcePhotos, true);
  assert.equal("photos" in compact, false);
  assert.equal("cardPhoto" in compact, false);
  assert.equal(JSON.stringify(compact).includes("data:image/"), false);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(full).length);
});

test("compact catalog normalizes legacy ingredient and step arrays", async () => {
  const { compactRecipeForCatalog } = await import("../recipe-catalog-utils.js?legacy-test");
  const compact = compactRecipeForCatalog({
    id: "shared-legacy",
    name: { en: "Legacy soup", es: "Sopa antigua" },
    ingredients: { en: ["1 onion"], es: ["1 cebolla"] },
    steps: { en: ["Cook"], es: ["Cocinar"] },
  });
  assert.equal(compact.ingredientsText.en, "1 onion");
  assert.equal(compact.stepsText.es, "Cocinar");
});

test("getJson timeout remains active while a response body is stalled", async () => {
  globalThis.localStorage = { getItem: () => "" };
  globalThis.fetch = async (_url, options) => ({
    ok: true,
    status: 200,
    json: () => new Promise((resolve, reject) => {
      const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      if (options.signal?.aborted) abort();
      else options.signal?.addEventListener("abort", abort, { once: true });
    }),
  });
  await assert.rejects(
    getJson("/slow", "Recipe catalog timed out", { timeoutMs: 10 }),
    /Recipe catalog timed out/
  );
});

test("recipe endpoint keeps a bounded full-detail read alongside compact catalog mode", async () => {
  const source = await readFile(new URL("../netlify/functions/recipes.js", import.meta.url), "utf8");
  assert.match(source, /params\.get\("id"\)/);
  assert.match(source, /params\.get\("view"\)/);
  assert.match(source, /view === "card"/);
  assert.match(source, /readRecipeById\(store, access\.household\.id, id/);
  assert.match(source, /Recipe not found/);
});

test("recipe endpoint backfills the platform starter catalog and overlays household records", async () => {
  const source = await readFile(new URL("../netlify/functions/recipes.js", import.meta.url), "utf8");
  assert.match(source, /PLATFORM_INDEX_KEY = "platform:recipe-index"/);
  assert.match(source, /PLATFORM_RECIPE_PREFIX = "platform:recipe:"/);
  assert.match(source, /ensurePlatformCatalog\(store\)/);
  assert.match(source, /householdRecipes,\s*\.\.\.platformRecipes\.filter/);
  assert.match(source, /!householdIds\.has\(recipe\.id\)/);
});

test("household catalog responses stay household-scoped before browser layering", () => {
  const householdRecipes = Array.from({ length: 60 }, (_, index) => ({
    id: `shared-${index + 1}`,
    name: { en: `Family recipe ${index + 1}` },
  }));
  const catalog = recipesFromCatalogResponse(householdRecipes);
  assert.equal(catalog.length, 60);
  assert.deepEqual(catalog.map(({ id }) => id), householdRecipes.map(({ id }) => id));
  assert.equal(recipesFromCatalogResponse([]).length, 0);
  assert.equal(recipesFromCatalogResponse(null).length, 0);
  assert.equal(catalog.some(({ id }) => id === "lemon-chicken"), false);
});

test("catalog response removes invalid and duplicate records without adding substitutes", () => {
  const catalog = recipesFromCatalogResponse([
    { id: "shared-one", name: { en: "First" } },
    null,
    { id: "", name: { en: "Invalid" } },
    { id: "shared-one", name: { en: "Newest copy" } },
  ]);
  assert.deepEqual(catalog, [{ id: "shared-one", name: { en: "Newest copy" } }]);
});

test("browser catalog loader uses the Blob catalog without bundled recipe fallback", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.match(source, /sharedRecipes = recipesFromCatalogResponse\(data\.recipes\)/);
  assert.match(source, /seedRecipes: \[\]/);
  assert.doesNotMatch(source, /recipes-data\.js/);
});
