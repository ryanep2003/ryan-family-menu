import assert from "node:assert/strict";
import test from "node:test";

import {
  applyVersionConflict,
  loadVersionedCollection,
  persistVersionedCollection,
  readVersionedCollectionStorage,
  saveVersionedCollection,
} from "../versioned-collection-client.js";

function storage(values = {}) {
  return {
    values,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem(key, value) {
      values[key] = value;
    },
  };
}

test("readVersionedCollectionStorage returns cached items and version", () => {
  const cached = readVersionedCollectionStorage(storage({
    groceries: '[{"text":"milk"}]',
    "groceries-version": "4",
  }), {
    itemsKey: "groceries",
    versionKey: "groceries-version",
  });

  assert.deepEqual(cached, { items: [{ text: "milk" }], version: 4 });
});

test("persistVersionedCollection writes items and version", () => {
  const target = storage();

  persistVersionedCollection(target, {
    itemsKey: "inventory",
    versionKey: "inventory-version",
  }, [{ text: "eggs" }], 7);

  assert.deepEqual(target.values, {
    inventory: '[{"text":"eggs"}]',
    "inventory-version": "7",
  });
});

test("loadVersionedCollection applies items and version", async () => {
  const state = { items: [], version: 0, renderCalls: 0 };
  const cached = [];

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
    persist: (items, version) => {
      cached.push({ items, version });
    },
    render: () => {
      state.renderCalls += 1;
    },
  });

  assert.deepEqual(state.items, [{ text: "milk" }]);
  assert.equal(state.version, 3);
  assert.deepEqual(cached, [{ items: [{ text: "milk" }], version: 3 }]);
  assert.equal(state.renderCalls, 1);
});

test("saveVersionedCollection sends items and updates server version", async () => {
  const state = { items: [{ text: "old" }], version: 1, payload: null, cached: [] };

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
    persist: (items, version) => {
      state.cached.push({ items, version });
    },
  });

  assert.deepEqual(state.payload, { url: "/items", payload: { items: [{ text: "old" }], version: 1 } });
  assert.deepEqual(state.items, [{ text: "new" }]);
  assert.equal(state.version, 2);
  assert.deepEqual(state.cached, [
    { items: [{ text: "old" }], version: 1 },
    { items: [{ text: "new" }], version: 2 },
  ]);
  assert.deepEqual(result, { saved: true, conflict: false });
});

test("applyVersionConflict loads server copy on 409", () => {
  const state = { items: [], version: 4, cached: [] };
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
    persist: (items, version) => {
      state.cached.push({ items, version });
    },
  });

  assert.equal(applied, true);
  assert.deepEqual(state.items, [{ text: "server" }]);
  assert.equal(state.version, 5);
  assert.deepEqual(state.cached, [{ items: [{ text: "server" }], version: 5 }]);
});
