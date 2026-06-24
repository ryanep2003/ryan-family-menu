import assert from "node:assert/strict";
import test from "node:test";

import {
  applyVersionConflict,
  loadVersionedCollection,
  saveVersionedCollection,
} from "../versioned-collection-client.js";

test("loadVersionedCollection applies items and version", async () => {
  const state = { items: [], version: 0, renderCalls: 0 };

  await loadVersionedCollection({
    getJson: async () => ({ items: [{ text: "milk" }], version: 3 }),
    url: "/items",
    fallbackMessage: "load failed",
    setItems: (items) => {
      state.items = items;
    },
    setVersion: (version) => {
      state.version = version;
    },
    render: () => {
      state.renderCalls += 1;
    },
  });

  assert.deepEqual(state.items, [{ text: "milk" }]);
  assert.equal(state.version, 3);
  assert.equal(state.renderCalls, 1);
});

test("saveVersionedCollection sends items and updates server version", async () => {
  const state = { items: [{ text: "old" }], version: 1, payload: null };

  const result = await saveVersionedCollection({
    putJson: async (url, payload) => {
      state.payload = { url, payload };
      return { items: [{ text: "new" }], version: 2 };
    },
    url: "/items",
    fallbackMessage: "save failed",
    items: state.items,
    version: state.version,
    setItems: (items) => {
      state.items = items;
    },
    setVersion: (version) => {
      state.version = version;
    },
  });

  assert.deepEqual(state.payload, { url: "/items", payload: { items: [{ text: "old" }], version: 1 } });
  assert.deepEqual(state.items, [{ text: "new" }]);
  assert.equal(state.version, 2);
  assert.deepEqual(result, { saved: true, conflict: false });
});

test("applyVersionConflict loads server copy on 409", () => {
  const state = { items: [], version: 4 };
  const applied = applyVersionConflict({
    status: 409,
    data: { items: [{ text: "server" }], version: 5 },
  }, {
    setItems: (items) => {
      state.items = items;
    },
    setVersion: (version) => {
      state.version = version;
    },
    currentVersion: state.version,
  });

  assert.equal(applied, true);
  assert.deepEqual(state.items, [{ text: "server" }]);
  assert.equal(state.version, 5);
});
