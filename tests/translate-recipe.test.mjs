import assert from "node:assert/strict";
import test from "node:test";

import { cleanTranslatedLines } from "../netlify/functions/translate-recipe.js";

test("recipe translation preserves a complete long cooking instruction", () => {
  const instruction = `${"Roast the cauliflower and check it often. ".repeat(14)}Finish with tahini and parsley.`;
  assert.ok(instruction.length > 220);
  assert.equal(cleanTranslatedLines([instruction]), instruction);
  assert.match(cleanTranslatedLines([instruction]), /tahini and parsley\.$/);
});

test("oversized translated content fails instead of being silently cut off", () => {
  assert.equal(cleanTranslatedLines(["x".repeat(12001)]), null);
  assert.equal(cleanTranslatedLines(Array.from({ length: 121 }, () => "step")), null);
  assert.equal(cleanTranslatedLines(["first", "second"]), "first\nsecond");
});
