import assert from "node:assert/strict";
import test from "node:test";

import { installInstructions } from "../app-lifecycle.js";

const labels = {
  installInstructionsAndroid: "android",
  installInstructionsIos: "ios",
  installInstructions: "default",
};

const t = (key) => labels[key] || key;

test("installInstructions selects Android install copy", () => {
  assert.equal(installInstructions("Mozilla/5.0 Android", t), "android");
});

test("installInstructions selects iOS install copy", () => {
  assert.equal(installInstructions("Mozilla/5.0 iPhone", t), "ios");
});

test("installInstructions falls back for desktop browsers", () => {
  assert.equal(installInstructions("Mozilla/5.0 Macintosh", t), "default");
});
