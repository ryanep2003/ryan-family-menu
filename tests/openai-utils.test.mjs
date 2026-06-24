import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanImageDataUrl,
  openAiErrorMessage,
  outputTextFromResponse,
  parseJsonObject,
} from "../netlify/functions/_openai.js";

test("cleanImageDataUrl keeps image data URLs under the byte limit", () => {
  const image = "data:image/jpeg;base64,abcd";
  assert.equal(cleanImageDataUrl(image, 100), image);
  assert.equal(cleanImageDataUrl(image, 1), "");
  assert.equal(cleanImageDataUrl("https://example.com/photo.jpg", 100), "");
});

test("parseJsonObject reads direct JSON or an embedded JSON object", () => {
  assert.deepEqual(parseJsonObject("{\"items\":[\"milk\"]}"), { items: ["milk"] });
  assert.deepEqual(parseJsonObject("Here is JSON: {\"name\":\"Soup\"} thanks"), { name: "Soup" });
  assert.equal(parseJsonObject("not json"), null);
});

test("outputTextFromResponse supports output_text and content arrays", () => {
  assert.equal(outputTextFromResponse({ output_text: "plain text" }), "plain text");
  assert.equal(outputTextFromResponse({
    output: [
      { content: [{ text: "first" }, { text: "second" }] },
      { content: [{ text: "third" }] },
    ],
  }), "first\nsecond\nthird");
});

test("openAiErrorMessage normalizes auth errors and keeps service messages", () => {
  assert.match(
    openAiErrorMessage({ status: 401 }, { error: { message: "bad key" } }, "fallback"),
    /OPENAI_API_KEY/,
  );
  assert.equal(
    openAiErrorMessage({ status: 429 }, { error: { message: "rate limited" } }, "fallback"),
    "rate limited",
  );
  assert.equal(openAiErrorMessage({ status: 500 }, {}, "fallback"), "fallback");
});
