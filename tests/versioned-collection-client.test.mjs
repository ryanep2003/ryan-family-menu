import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLoadedVersionedCollection,
  applyVersionConflict,
  cloneVersionedItems,
  createVersionedCollectionRetryCoordinator,
  createVersionedCollectionSaveCoordinator,
  createVersionedIntent,
  loadVersionedCollection,
  mergeVersionedItems,
  normalizeVersionedIntent,
  persistVersionedCollection,
  reconcileLoadedVersionedCollection,
  readVersionedCollectionStorage,
  saveVersionedCollection,
  versionedCollectionResponse,
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

test("versioned collection responses fail closed when a 200 response is incomplete", () => {
  assert.throws(() => versionedCollectionResponse({}), (error) => error.code === "malformed-response");
  assert.throws(() => versionedCollectionResponse({ items: [], version: "bad" }), (error) => error.code === "malformed-response");
  assert.deepEqual(versionedCollectionResponse({ items: [{ id: "milk" }], version: 2 }), {
    items: [{ id: "milk" }],
    version: 2,
  });
});

test("a failed initial load retries with GET behavior and never manufactures a save", async () => {
  const calls = [];
  let retry;
  const load = async () => {
    calls.push("load");
    if (calls.length === 1) {
      retry.setFailure("load");
      return false;
    }
    retry.clear();
    return true;
  };
  retry = createVersionedCollectionRetryCoordinator({
    load,
    save: async () => { calls.push("save"); return true; },
  });

  await load();
  assert.equal(await retry.retry(), true);
  assert.deepEqual(calls, ["load", "load"]);
});

test("a failed load with pending intent reloads and merges before saving", async () => {
  const base = [{ id: "milk" }];
  const pending = createVersionedIntent({ items: [], version: 4, baseItems: base });
  const calls = [];
  let retry;
  retry = createVersionedCollectionRetryCoordinator({
    hasPending: () => true,
    load: async () => {
      calls.push("load");
      const result = reconcileLoadedVersionedCollection({
        pendingIntent: pending,
        remoteItems: [...base, { id: "bread" }],
        remoteVersion: 5,
      });
      if (result.shouldSave) calls.push(`save:${result.items.map((item) => item.id).join(",")}`);
      retry.clear();
      return true;
    },
    save: async () => { calls.push("direct-save"); return true; },
  });
  retry.setFailure("load");

  assert.equal(await retry.retry(), true);
  assert.deepEqual(calls, ["load", "save:bread"]);
});

test("a failed pending PUT retries a save without an unnecessary load", async () => {
  const calls = [];
  const retry = createVersionedCollectionRetryCoordinator({
    hasPending: () => true,
    load: async () => { calls.push("load"); return true; },
    save: async () => { calls.push("save"); return true; },
  });
  retry.setFailure("save");

  assert.equal(await retry.retry(), true);
  assert.deepEqual(calls, ["save"]);
});

test("retry taps and reconnect share one in-flight recovery request", async () => {
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  let loads = 0;
  const busy = [];
  const retry = createVersionedCollectionRetryCoordinator({
    load: async () => { loads += 1; await blocked; return true; },
    save: async () => true,
    onBusyChange: (value) => busy.push(value),
  });
  retry.setFailure("load");
  const tap = retry.retry();
  const reconnect = retry.retry();
  assert.equal(tap, reconnect);
  release();
  assert.equal(await tap, true);
  assert.equal(loads, 1);
  assert.deepEqual(busy, [true, false]);
});

test("cleanup retry performs only local recovery work", async () => {
  const calls = [];
  const retry = createVersionedCollectionRetryCoordinator({
    load: async () => { calls.push("load"); return true; },
    save: async () => { calls.push("save"); return true; },
    cleanup: async () => { calls.push("cleanup"); return true; },
  });
  retry.setFailure("cleanup");

  assert.equal(await retry.retry(), true);
  assert.deepEqual(calls, ["cleanup"]);
});

test("local persistence failures do not block a successful cloud save", async () => {
  let putCalls = 0;
  let savedResult;
  const coordinator = createVersionedCollectionSaveCoordinator({
    getItems: () => [{ id: "milk" }],
    setItems: () => {},
    getVersion: () => 1,
    setVersion: () => {},
    getBaseItems: () => [],
    setBaseItems: () => {},
    getPendingIntent: () => null,
    setPendingIntent: () => { throw Object.assign(new Error("storage unavailable"), { name: "QuotaExceededError" }); },
    persist: () => { throw Object.assign(new Error("storage unavailable"), { name: "QuotaExceededError" }); },
    put: async (items) => { putCalls += 1; return { items, version: 2 }; },
    onSaved: (result) => { savedResult = result; },
  });

  assert.equal(await coordinator.save(), true);
  assert.equal(putCalls, 1);
  assert.equal(savedResult.settled, true);
  assert.equal(savedResult.storageError.name, "QuotaExceededError");
});

test("post-PUT storage failure reports cloud success and clears in-memory intent", async () => {
  let pendingIntent = null;
  let persistCalls = 0;
  let clearCalls = 0;
  let putCalls = 0;
  let savedResult;
  let pendingFailure = false;
  const coordinator = createVersionedCollectionSaveCoordinator({
    getItems: () => [{ id: "milk", checked: true }],
    setItems: () => {},
    getVersion: () => 1,
    setVersion: () => {},
    getBaseItems: () => [{ id: "milk", checked: false }],
    setBaseItems: () => {},
    getPendingIntent: () => pendingIntent,
    setPendingIntent: (intent) => {
      if (!intent) clearCalls += 1;
      pendingIntent = intent;
    },
    persist: () => {
      persistCalls += 1;
      if (persistCalls > 1) throw Object.assign(new Error("storage full"), { name: "QuotaExceededError" });
    },
    put: async (items) => {
      putCalls += 1;
      return { items, version: 2 };
    },
    onSaved: (result) => { savedResult = result; },
    onPending: () => { pendingFailure = true; },
  });

  assert.equal(await coordinator.save(), true);
  assert.equal(putCalls, 1);
  assert.equal(savedResult.storageError.name, "QuotaExceededError");
  assert.equal(pendingIntent, null);
  assert.equal(clearCalls, 1);
  assert.equal(pendingFailure, false);
});

test("failed journal removal leaves a rebased no-op journal for reopening", async () => {
  let items = [{ id: "milk", checked: true }];
  let version = 4;
  let baseItems = [{ id: "milk", checked: false }];
  let memoryIntent = null;
  let durableIntent = null;
  const coordinator = createVersionedCollectionSaveCoordinator({
    getItems: () => items,
    setItems: (next) => { items = next; },
    getVersion: () => version,
    setVersion: (next) => { version = next; },
    getBaseItems: () => baseItems,
    setBaseItems: (next) => { baseItems = next; },
    getPendingIntent: () => memoryIntent,
    setPendingIntent: (next) => {
      memoryIntent = normalizeVersionedIntent(next);
      if (!next) throw Object.assign(new Error("removal blocked"), { name: "SecurityError" });
      durableIntent = cloneVersionedItems([next])[0];
    },
    persist: () => {},
    put: async (outgoing) => ({ items: outgoing, version: 5 }),
  });

  assert.equal(await coordinator.save(), true);
  assert.equal(memoryIntent, null);
  assert.deepEqual(durableIntent.baseItems, [{ id: "milk", checked: true }]);
  assert.deepEqual(durableIntent.items, durableIntent.baseItems);
  assert.equal(durableIntent.baseVersion, 5);

  const reopened = reconcileLoadedVersionedCollection({
    pendingIntent: durableIntent,
    localItems: durableIntent.items,
    localVersion: durableIntent.baseVersion,
    baseItems: durableIntent.baseItems,
    remoteItems: [{ id: "milk", checked: false }, { id: "bread" }],
    remoteVersion: 6,
  });
  assert.deepEqual(reopened.items, [{ id: "milk", checked: false }, { id: "bread" }]);
  assert.equal(reopened.shouldSave, false);
  assert.equal(reopened.clearPending, true);
});

test("failed acknowledgement and removal expose finite local cleanup without another PUT", async () => {
  const oldIntent = createVersionedIntent({
    items: [{ id: "milk", checked: true }],
    version: 3,
    baseItems: [{ id: "milk", checked: false }],
  });
  let blocked = true;
  let memoryIntent = oldIntent;
  let durableIntent = cloneVersionedItems([oldIntent])[0];
  let putCalls = 0;
  let savedResult;
  const storageError = Object.assign(new Error("storage blocked"), { name: "SecurityError" });
  const coordinator = createVersionedCollectionSaveCoordinator({
    getItems: () => [],
    setItems: () => {},
    getVersion: () => 3,
    setVersion: () => {},
    getBaseItems: () => oldIntent.baseItems,
    setBaseItems: () => {},
    getPendingIntent: () => memoryIntent,
    setPendingIntent: (next) => {
      memoryIntent = normalizeVersionedIntent(next);
      if (blocked) throw storageError;
      durableIntent = next ? cloneVersionedItems([next])[0] : null;
    },
    persist: () => { if (blocked) throw storageError; },
    put: async (outgoing) => { putCalls += 1; return { items: outgoing, version: 4 }; },
    onSaved: (result) => { savedResult = result; },
  });

  assert.equal(await coordinator.save(), true);
  assert.equal(putCalls, 1);
  assert.equal(savedResult.cleanupPending, true);
  assert.equal(coordinator.hasLocalCleanup(), true);
  assert.deepEqual(durableIntent, oldIntent);

  blocked = false;
  assert.deepEqual(coordinator.retryLocalCleanup(), { cleaned: true, storageError: null });
  assert.equal(putCalls, 1);
  assert.equal(durableIntent, null);
  assert.equal(coordinator.hasLocalCleanup(), false);
});

test("blocked storage still permits conflict merge and preserves remote additions", async () => {
  const writes = [];
  let items = [{ id: "milk", checked: true }];
  let version = 4;
  let baseItems = [{ id: "milk", checked: false }, { id: "eggs", checked: false }];
  let pendingIntent = null;
  const quotaError = Object.assign(new Error("storage full"), { name: "QuotaExceededError" });
  const coordinator = createVersionedCollectionSaveCoordinator({
    getItems: () => items,
    setItems: (next) => { items = next; },
    getVersion: () => version,
    setVersion: (next) => { version = next; },
    getBaseItems: () => baseItems,
    setBaseItems: (next) => { baseItems = next; },
    getPendingIntent: () => pendingIntent,
    setPendingIntent: (next) => { pendingIntent = normalizeVersionedIntent(next); throw quotaError; },
    persist: () => { throw quotaError; },
    put: async (outgoing, requestVersion) => {
      writes.push({ items: cloneVersionedItems(outgoing), version: requestVersion });
      if (writes.length === 1) {
        throw Object.assign(new Error("conflict"), {
          status: 409,
          data: {
            items: [
              { id: "milk", checked: false },
              { id: "eggs", checked: true },
              { id: "bread", checked: false },
            ],
            version: 5,
          },
        });
      }
      return { items: outgoing, version: 6 };
    },
  });

  assert.equal(await coordinator.save(), true);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1], {
    items: [{ id: "milk", checked: true }, { id: "bread", checked: false }],
    version: 5,
  });
});

test("offline plus blocked storage remains pending in memory and retries safely", async () => {
  let blocked = true;
  let pendingIntent = null;
  let putCalls = 0;
  let pendingError;
  const quotaError = Object.assign(new Error("storage full"), { name: "QuotaExceededError" });
  const coordinator = createVersionedCollectionSaveCoordinator({
    getItems: () => [{ id: "milk", checked: true }],
    setItems: () => {},
    getVersion: () => 1,
    setVersion: () => {},
    getBaseItems: () => [{ id: "milk", checked: false }],
    setBaseItems: () => {},
    getPendingIntent: () => pendingIntent,
    setPendingIntent: (next) => {
      pendingIntent = normalizeVersionedIntent(next);
      if (blocked) throw quotaError;
    },
    persist: () => { if (blocked) throw quotaError; },
    put: async (outgoing) => {
      putCalls += 1;
      if (blocked) throw Object.assign(new Error("offline"), { code: "offline" });
      return { items: outgoing, version: 2 };
    },
    onPending: (error) => { pendingError = error; },
  });

  assert.equal(await coordinator.save(), false);
  assert.equal(pendingError.name, "QuotaExceededError");
  assert.ok(pendingIntent);
  blocked = false;
  assert.equal(await coordinator.save(), true);
  assert.equal(putCalls, 2);
  assert.equal(pendingIntent, null);
});

test("an acknowledged stale journal does not replay after cloud success", () => {
  const pendingIntent = createVersionedIntent({
    items: [],
    version: 4,
    baseItems: [{ id: "milk" }],
  });
  const result = reconcileLoadedVersionedCollection({
    pendingIntent,
    localItems: [],
    localVersion: 4,
    baseItems: [{ id: "milk" }],
    remoteItems: [{ id: "bread" }],
    remoteVersion: 6,
  });

  assert.deepEqual(result.items, [{ id: "bread" }]);
  assert.equal(result.shouldSave, false);
  assert.equal(result.clearPending, true);
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

test("blocked collection cache reads fall back without preventing cloud recovery", () => {
  const blocked = {
    getItem() {
      throw Object.assign(new Error("storage blocked"), { name: "SecurityError" });
    },
  };
  assert.deepEqual(readVersionedCollectionStorage(blocked, {
    itemsKey: "groceries",
    versionKey: "groceries-version",
  }), { items: [], version: 0 });
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
