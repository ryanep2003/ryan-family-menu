import assert from "node:assert/strict";
import test from "node:test";

import { appearsEnglish, linesMatchLanguage, textMatchesLanguage } from "../language-quality.js";

test("language quality detects English stored in Spanish fields", () => {
  assert.equal(appearsEnglish("Lemony Butter Beans"), true);
  assert.equal(appearsEnglish("Good family task: kids can help shape meatballs with clean hands."), true);
  assert.equal(appearsEnglish("Note says other large white beans like Great Northern or Corona can be used."), true);
  assert.equal(textMatchesLanguage("Oven roasted vegetables", "es"), false);
  assert.equal(linesMatchLanguage([
    "3 cucharadas de sal",
    "2 tablespoons chili powder",
    "Corn tortillas, warmed",
  ], "es"), false);
});

test("language quality preserves Spanish food content and English mode", () => {
  assert.equal(appearsEnglish("Pasta con pesto fresco de albahaca"), false);
  assert.equal(appearsEnglish("Sirve caliente con aceite de oliva y sal."), false);
  assert.equal(textMatchesLanguage("Lemony Butter Beans", "en"), true);
});
