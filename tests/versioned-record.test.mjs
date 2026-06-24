import test from "node:test";
import assert from "node:assert/strict";
import {
  hasVersionConflict,
  nextVersionedRecord,
  versionedRecord,
} from "../netlify/functions/_versioned-record.js";

test("versionedRecord reads legacy collection arrays as version zero", () => {
  assert.deepEqual(versionedRecord([{ text: "milk" }], "items"), {
    items: [{ text: "milk" }],
    version: 0,
    updatedAt: "",
  });
});

test("versionedRecord reads wrapped records with metadata", () => {
  assert.deepEqual(versionedRecord({
    items: [{ text: "milk" }],
    version: 3,
    updatedAt: "2026-06-24T10:00:00.000Z",
  }, "items"), {
    items: [{ text: "milk" }],
    version: 3,
    updatedAt: "2026-06-24T10:00:00.000Z",
  });
});

test("hasVersionConflict ignores missing legacy client versions", () => {
  assert.equal(hasVersionConflict(undefined, 4), false);
  assert.equal(hasVersionConflict("4", 4), false);
  assert.equal(hasVersionConflict(3, 4), true);
});

test("nextVersionedRecord increments version and stamps update time", () => {
  const record = nextVersionedRecord("items", [{ text: "milk" }], 4);

  assert.deepEqual(record.items, [{ text: "milk" }]);
  assert.equal(record.version, 5);
  assert.match(record.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});
