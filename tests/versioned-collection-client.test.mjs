import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLoadedVersionedCollection,
  applyVersionConflict,
  cloneVersionedItems,
  createVersionedCollectionSaveCoordinator,
  createVersionedIntent,
  loadVersionedCollection,
  mergeVersionedItems,
  normalizeVersionedIntent,
  persistVersionedCollection,
  reconcileLoadedVersionedCollection,
  readVersionedCollectionStorage,
  saveVersionedCollection,
} from "../versioned-collection-client.js";

test("mergeVersionedItems keeps non-conflicting phone edits and deletions", () => {
  const base = [{ id: "milk", quantity: 1 }, { id: "eggs", quantity: 1 }];
  const local = [{ id: "milk", quantity: 2 }];
  const remote = [{ id: "milk", quantity: 1 }, { id: "eggs", quantity: 2 }, { id: "bread", quantity: 1 }];
  assert.deepEqual(mergeVersionedItems(local, base, remote), [
    { id: "milk", quantity: 2 },
    { id: "bread", quantity: 1 },
  ]);
});

test("cloned conflict baseline detects an in-place UI edit", () => {
  const base = [{ id: "milk", checked: false }];
  const local = cloneVersionedItems(base);
  local[0].checked = true;
  assert.deepEqual(mergeVersionedItems(local, base, [{ id: "milk", checked: false }]), [
    { id: "milk", checked: true },
  ]);
});

test("a same-version reload keeps locally checked groceries and asks to save", () => {
  const local = [{ id: "milk", checked: true }];
  const remote = [{ id: "milk", checked: false }];
  const result = applyLoadedVersionedCollection({
    localItems: local,
    localVersion: 5,
    baseItems: local,
    remoteItems: remote,
    remoteVersion: 5,
  });
  assert.equal(result.apply, true);
  assert.equal(result.shouldSave, true);
  assert.equal(result.items[0].checked, true);
});

test("a stale grocery snapshot cannot overwrite a newer local save", () => {
  const result = applyLoadedVersionedCollection({
    localItems: [{ id: "milk", checked: true }],
    localVersion: 6,
    baseItems: [{ id: "milk", checked: true }],
    remoteItems: [{ id: "milk", checked: false }],
    remoteVersion: 5,
  });
  assert.deepEqual(result, { apply: false, reason: "stale-remote" });
});

test("an in-flight grocery save is not clobbered by a concurrent load", () => {
  const result = applyLoadedVersionedCollection({
    localItems: [{ id: "milk", checked: true }],
    localVersion: 5,
    baseItems: [{ id: "milk", checked: false }],
    remoteItems: [{ id: "milk", checked: false }],
    remoteVersion: 5,
    saveInFlight: true,
  });
  assert.deepEqual(result, { apply: false, reason: "save-in-flight" });
});

test("newer remote groceries still keep a local checked edit through three-way merge", () => {
  const result = applyLoadedVersionedCollection({
    localItems: [
      { id: "milk", checked: true },
      { id: "eggs", checked: false },
    ],
    localVersion: 5,
    baseItems: [
      { id: "milk", checked: false },
      { id: "eggs", checked: false },
    ],
    remoteItems: [
      { id: "milk", checked: false },
      { id: "eggs", checked: false },
      { id: "bread", checked: false },
    ],
    remoteVersion: 6,
  });
  assert.equal(result.apply, true);
  assert.equal(result.shouldSave, true);
  assert.equal(result.items.find((item) => item.id === "milk").checked, true);
  assert.ok(result.items.find((item) => item.id === "bread"));
});

test("a durable clear intent survives reload and removes known items from a newer remote list", () => {
  const base = [{ id: "milk" }, { id: "eggs" }];
  const pendingIntent = createVersionedIntent({ items: [], version: 5, baseItems: base });
  const restored = normalizeVersionedIntent(JSON.parse(JSON.stringify(pendingIntent)));
  const result = reconcileLoadedVersionedCollection({
    pendingIntent: restored,
    localItems: [],
    localVersion: 5,
    baseItems: [],
    remoteItems: [...base, { id: "bread" }],
    remoteVersion: 6,
  });

  assert.deepEqual(result.items, [{ id: "bread" }]);
  assert.equal(result.shouldSave, true);
  assert.deepEqual(result.pendingIntent.baseItems, [...base, { id: "bread" }]);
});

test("the local pending journal is versioned, validated, and bounded to the grocery limit", () => {
  assert.equal(normalizeVersionedIntent({ schemaVersion: 2, baseItems: [], items: [] }), null);
  const manyItems = Array.from({ length: 510 }, (_, id) => ({ id: `${id}` }));
  const pending = normalizeVersionedIntent({
    schemaVersion: 1,
    baseItems: manyItems,
    baseVersion: Number.MAX_SAFE_INTEGER + 1,
    items: manyItems,
  });
  assert.equal(pending.baseItems.length, 500);
  assert.equal(pending.items.length, 500);
  assert.equal(pending.baseVersion, 0);
});

function groceryCoordinatorHarness({ items, version = 1, baseItems = items, put }) {
  const state = {
    items: cloneVersionedItems(items),
    version,
    baseItems: cloneVersionedItems(baseItems),
    pendingIntent: null,
    persisted: [],
    loadGeneration: 1,
  };
  const coordinator = createVersionedCollectionSaveCoordinator({
    getItems: () => state.items,
    setItems: (next) => { state.items = next; },
    getVersion: () => state.version,
    setVersion: (next) => { state.version = next; },
    getBaseItems: () => state.baseItems,
    setBaseItems: (next) => { state.baseItems = next; },
    getPendingIntent: () => state.pendingIntent,
    setPendingIntent: (next) => { state.pendingIntent = normalizeVersionedIntent(next); },
    persist: (next, nextVersion) => state.persisted.push({ items: cloneVersionedItems(next), version: nextVersion }),
    put,
    invalidateLoads: () => { state.loadGeneration += 1; },
  });
  return { state, coordinator };
}

test("a local grocery edit invalidates a GET that started before the edit", async () => {
  const { state, coordinator } = groceryCoordinatorHarness({
    items: [{ id: "milk", checked: false }],
    put: async (items, version) => ({ items, version: version + 1 }),
  });
  const startedGeneration = state.loadGeneration;
  state.items = [{ id: "milk", checked: true }];
  await coordinator.save();
  assert.notEqual(startedGeneration, state.loadGeneration);
  assert.equal(state.items[0].checked, true);
});

test("a queued clear waits for an earlier save and reports its own successful result", async () => {
  let releaseFirst;
  const firstResponse = new Promise((resolve) => { releaseFirst = resolve; });
  const writes = [];
  const { state, coordinator } = groceryCoordinatorHarness({
    items: [{ id: "milk", checked: false }],
    put: async (items, version) => {
      writes.push({ items: cloneVersionedItems(items), version });
      if (writes.length === 1) await firstResponse;
      return { items, version: version + 1 };
    },
  });

  state.items = [{ id: "milk", checked: true }];
  const first = coordinator.save();
  state.items = [];
  const clear = coordinator.save();
  releaseFirst();

  assert.deepEqual(await Promise.all([first, clear]), [true, true]);
  assert.deepEqual(writes.map(({ items }) => items), [[{ id: "milk", checked: true }], []]);
  assert.deepEqual(state.items, []);
  assert.equal(state.pendingIntent, null);
});

test("a queued 503 returns false and keeps the clear in the durable pending intent", async () => {
  let releaseFirst;
  const firstResponse = new Promise((resolve) => { releaseFirst = resolve; });
  let calls = 0;
  const { state, coordinator } = groceryCoordinatorHarness({
    items: [{ id: "milk", checked: false }],
    put: async (items, version) => {
      calls += 1;
      if (calls === 1) {
        await firstResponse;
        return { items, version: version + 1 };
      }
      const error = new Error("unavailable");
      error.status = 503;
      throw error;
    },
  });

  state.items = [{ id: "milk", checked: true }];
  const first = coordinator.save();
  state.items = [];
  const clear = coordinator.save();
  releaseFirst();

  assert.deepEqual(await Promise.all([first, clear]), [true, false]);
  assert.deepEqual(state.items, []);
  assert.deepEqual(state.pendingIntent.items, []);
  assert.equal(state.pendingIntent.baseVersion, 2);
});

test("a clear retries one 409, removes known items, and retains a new remote item", async () => {
  const base = [{ id: "milk" }];
  const writes = [];
  const { state, coordinator } = groceryCoordinatorHarness({
    items: [],
    version: 1,
    baseItems: base,
    put: async (items, version) => {
      writes.push({ items: cloneVersionedItems(items), version });
      if (writes.length === 1) {
        const error = new Error("conflict");
        error.status = 409;
        error.data = { items: [...base, { id: "bread" }], version: 2 };
        throw error;
      }
      return { items, version: 3 };
    },
  });

  assert.equal(await coordinator.save(), true);
  assert.deepEqual(writes, [
    { items: [], version: 1 },
    { items: [{ id: "bread" }], version: 2 },
  ]);
  assert.deepEqual(state.items, [{ id: "bread" }]);
});

test("a repeated 409 stays pending and adopts the newest remote baseline", async () => {
  const base = [{ id: "milk" }];
  let calls = 0;
  const { state, coordinator } = groceryCoordinatorHarness({
    items: [],
    version: 1,
    baseItems: base,
    put: async () => {
      calls += 1;
      const error = new Error("conflict");
      error.status = 409;
      error.data = calls === 1
        ? { items: [...base, { id: "bread" }], version: 2 }
        : { items: [...base, { id: "bread" }, { id: "apples" }], version: 3 };
      throw error;
    },
  });

  assert.equal(await coordinator.save(), false);
  assert.deepEqual(state.items, [{ id: "bread" }, { id: "apples" }]);
  assert.equal(state.pendingIntent.baseVersion, 3);
  assert.deepEqual(state.pendingIntent.baseItems, [...base, { id: "bread" }, { id: "apples" }]);
});

test("undo after a reconciled clear restores removed items without dropping remote additions", async () => {
  const removed = [{ id: "milk" }, { id: "eggs" }];
  const remoteOnly = { id: "bread" };
  const { state, coordinator } = groceryCoordinatorHarness({
    items: [remoteOnly],
    version: 6,
    baseItems: [remoteOnly],
    put: async (items, version) => ({ items, version: version + 1 }),
  });
  state.items = [...removed, ...state.items];
  assert.equal(await coordinator.save(), true);
  assert.deepEqual(new Set(state.items.map((item) => item.id)), new Set(["milk", "eggs", "bread"]));
});

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
  assert.deepEqual(result, { saved: true, conflict: false, items: [{ text: "new" }], version: 2 });
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
