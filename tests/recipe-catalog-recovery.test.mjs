import test from "node:test";
import assert from "node:assert/strict";
import { compactRecipeForCatalog } from "../recipe-catalog-utils.js";
import { getJson } from "../api.js";

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
    createdAt: "2026-08-19T00:00:00.000Z",
    photos: ["data:image/jpeg;base64," + "x".repeat(1000)],
    cardPhoto: "data:image/jpeg;base64," + "y".repeat(1000),
  };
  const compact = compactRecipeForCatalog(full);
  assert.equal(compact.id, full.id);
  assert.equal(compact.ingredientsText.en, "1 onion");
  assert.equal(compact.stepsText.es, "Cocinar");
  assert.equal(compact.hasSourcePhotos, true);
  assert.equal("photos" in compact, false);
  assert.equal("cardPhoto" in compact, false);
  assert.equal(JSON.stringify(compact).includes("data:image/"), false);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(full).length);
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
