import test from "node:test";
import assert from "node:assert/strict";

import {
  cleanLocalizedText,
  localizedText,
  localizedTextExact,
  updateLocalizedText,
} from "../localized-data.js";

test("cleanLocalizedText preserves explicit language values", () => {
  assert.deepEqual(cleanLocalizedText({ es: "  Tacos  " }, 120), { es: "Tacos" });
});

test("cleanLocalizedText duplicates legacy text for bilingual fallback", () => {
  assert.deepEqual(cleanLocalizedText("  Milk  ", 120), { en: "Milk", es: "Milk" });
});

test("localizedText falls back to the other language", () => {
  assert.equal(localizedText({ es: "Despensa" }, "en"), "Despensa");
});

test("localizedTextExact does not treat fallback text as translated content", () => {
  assert.equal(localizedTextExact("Legacy English recipe", "es"), "");
  assert.equal(localizedTextExact({ en: "Milk" }, "es"), "");
});

test("updateLocalizedText preserves the opposite language when editing", () => {
  assert.deepEqual(
    updateLocalizedText("Chicken tacos", "Tacos de pollo", "es"),
    { en: "Chicken tacos", es: "Tacos de pollo" }
  );
});
