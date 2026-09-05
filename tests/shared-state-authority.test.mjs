import assert from "node:assert/strict";
import test from "node:test";
import { collectionLoadState, reconcileUninitializedLedger, sharedStateWithAuthoritativeDomains } from "../shared-state-authority.js";

test("a late shared-state response cannot replace an already loaded schedule or ledger", () => {
  const current = { schedule: { mon: "new" }, calendarMeals: { today: "new" }, weekStartKey: "2026-09-07", receipts: [{ id: "new-receipt" }], activity: [{ id: "new-activity" }] };
  const incoming = { schedule: { mon: "old" }, calendarMeals: { today: "old" }, weekStartKey: "2026-08-31", receipts: [{ id: "old-receipt" }], activity: [{ id: "old-activity" }] };
  const result = sharedStateWithAuthoritativeDomains(current, incoming, { schedule: true, receipts: true, activity: true });
  assert.deepEqual(result.schedule, current.schedule);
  assert.deepEqual(result.calendarMeals, current.calendarMeals);
  assert.equal(result.weekStartKey, current.weekStartKey);
  assert.deepEqual(result.receipts, current.receipts);
  assert.deepEqual(result.activity, current.activity);
});

test("shared state still supplies domains whose authoritative request has not loaded", () => {
  const result = sharedStateWithAuthoritativeDomains({ schedule: { local: true } }, { schedule: { remote: true }, receipts: [{ id: "remote" }] }, { schedule: false });
  assert.deepEqual(result.schedule, { remote: true });
  assert.deepEqual(result.receipts, [{ id: "remote" }]);
});

test("an empty version-zero ledger remains eligible for legacy migration", () => {
  const loaded = collectionLoadState({ items: [], version: 0, localItems: [{ id: "local-legacy" }] });
  assert.equal(loaded.initialized, false);
  assert.deepEqual(loaded.items, [{ id: "local-legacy" }]);
});

test("a versioned empty ledger is an intentional empty collection", () => {
  const loaded = collectionLoadState({ items: [], version: 7, localItems: [{ id: "legacy" }] });
  assert.equal(loaded.initialized, true);
  assert.deepEqual(loaded.items, []);
});

test("legacy shared receipts win when an uninitialized ledger response arrives first", () => {
  const ledger = collectionLoadState({ items: [], version: 0, localItems: [] });
  const result = sharedStateWithAuthoritativeDomains(
    { receipts: ledger.items },
    { receipts: [{ id: "legacy-shared" }] },
    { receipts: ledger.initialized },
  );
  assert.deepEqual(result.receipts, [{ id: "legacy-shared" }]);
});

test("local legacy receipts survive an uninitialized ledger before shared state", () => {
  const ledger = collectionLoadState({ items: [], version: 0, localItems: [{ id: "local-legacy" }] });
  const result = sharedStateWithAuthoritativeDomains(
    { receipts: ledger.items },
    { receipts: [{ id: "legacy-shared" }] },
    { receipts: ledger.initialized },
  );
  assert.deepEqual(result.receipts, [{ id: "legacy-shared" }]);
});

test("shared legacy receipts remain when the uninitialized ledger arrives after shared state", () => {
  const sharedFirst = { receipts: [{ id: "legacy-shared" }] };
  const ledger = collectionLoadState({ items: [], version: 0, localItems: sharedFirst.receipts });
  assert.deepEqual(ledger.items, sharedFirst.receipts);
  assert.equal(ledger.initialized, false);
});

test("ledger-first migration waits for shared legacy data before writing", async () => {
  let resolveShared;
  let sharedReady = false;
  let current = [];
  let authoritative = false;
  let writes = 0;
  const sharedLoad = new Promise((resolve) => { resolveShared = resolve; });
  const loading = reconcileUninitializedLedger({
    items: [],
    version: 0,
    sharedReady: () => sharedReady,
    waitForShared: () => sharedLoad,
    getCurrentItems: () => current,
    setCurrentItems: (items) => { current = items; },
    setDirty: () => {},
    isAuthoritative: () => authoritative,
    setAuthoritative: (value) => { authoritative = value; },
    save: async () => { writes += 1; return true; },
  });
  current = [{ id: "legacy-shared" }];
  sharedReady = true;
  resolveShared();
  const result = await loading;
  assert.deepEqual(result.items, [{ id: "legacy-shared" }]);
  assert.equal(writes, 1);
  assert.equal(authoritative, true);
});

test("shared-first migration writes the legacy collection once when its ledger is empty", async () => {
  let current = [{ id: "legacy-shared" }];
  let authoritative = false;
  let writes = 0;
  const result = await reconcileUninitializedLedger({
    items: [],
    version: 0,
    sharedReady: () => true,
    getCurrentItems: () => current,
    setCurrentItems: (items) => { current = items; },
    setDirty: () => {},
    isAuthoritative: () => authoritative,
    setAuthoritative: (value) => { authoritative = value; },
    save: async () => { writes += 1; return true; },
  });
  assert.deepEqual(current, [{ id: "legacy-shared" }]);
  assert.equal(result.migrated, true);
  assert.equal(writes, 1);
  assert.equal(authoritative, true);
});

test("an empty legacy response does not create a write when shared data has no history", async () => {
  let writes = 0;
  const result = await reconcileUninitializedLedger({
    items: [],
    version: 0,
    sharedReady: () => true,
    getCurrentItems: () => [],
    setDirty: () => {},
    save: async () => { writes += 1; return true; },
  });
  assert.equal(result.migrated, false);
  assert.equal(writes, 0);
});

test("a delayed positive-version empty ledger cannot resurrect stale shared history", async () => {
  let sharedReady = true;
  let current = [];
  let authoritative = false;
  let migrationWrites = 0;
  current = [{ id: "stale-legacy" }];
  const loading = reconcileUninitializedLedger({
    items: [],
    version: 7,
    sharedReady: () => sharedReady,
    getCurrentItems: () => current,
    setCurrentItems: (items) => { current = items; },
    isAuthoritative: () => authoritative,
    setAuthoritative: (value) => { authoritative = value; },
    save: async () => { migrationWrites += 1; return true; },
  });

  // A shared response may be stale, but migration ownership is still pending
  // until the separate ledger request reports its positive version.
  assert.equal(migrationWrites, 0);
  const result = await loading;

  assert.deepEqual(result.items, []);
  assert.equal(result.authoritative, true);
  assert.equal(migrationWrites, 0);
  assert.deepEqual(current, []);
});
