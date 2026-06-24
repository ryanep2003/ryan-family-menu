import assert from "node:assert/strict";
import test from "node:test";

import { readJsonStorage, readNumberStorage, readStringStorage } from "../storage-utils.js";

function storage(values = {}) {
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
  };
}

test("readJsonStorage returns parsed values and falls back for bad JSON", () => {
  assert.deepEqual(readJsonStorage(storage({ good: "[1,2]" }), "good", []), [1, 2]);
  assert.deepEqual(readJsonStorage(storage({ bad: "not-json" }), "bad", ["fallback"]), ["fallback"]);
  assert.deepEqual(readJsonStorage(storage(), "missing", { ok: true }), { ok: true });
});

test("readStringStorage handles missing and empty strings", () => {
  assert.equal(readStringStorage(storage({ lang: "es" }), "lang", "en"), "es");
  assert.equal(readStringStorage(storage({ lang: "" }), "lang", "en"), "en");
  assert.equal(readStringStorage(storage(), "missing", "en"), "en");
});

test("readNumberStorage handles invalid numbers", () => {
  assert.equal(readNumberStorage(storage({ version: "4" }), "version", 0), 4);
  assert.equal(readNumberStorage(storage({ version: "nope" }), "version", 7), 7);
  assert.equal(readNumberStorage(storage(), "missing", 9), 9);
});
